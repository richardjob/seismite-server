import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';

function createMcpServer(prisma: PrismaClient) {
    const server = new McpServer({
        name: "seismite-mcp",
        version: "1.0.0",
    });

    server.registerTool(
        "list_projects",
        {
            description: "List all tracked Seismite projects with their hostnames to get projectIds for querying locators.",
        },
        async () => {
            try {
                const projects = await prisma.project.findMany({
                    include: {
                        _count: { select: { pages: true } },
                        pages: { include: { _count: { select: { locators: true } } } },
                    },
                    orderBy: { createdAt: 'desc' },
                });

                const result = projects.map((p: any) => ({
                    id: p.id,
                    hostname: p.hostname,
                    name: p.name,
                    pageCount: p._count.pages,
                    locatorCount: p.pages.reduce((sum: number, pg: any) => sum + pg._count.locators, 0),
                }));

                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error fetching projects: ${error.message}` }],
                    isError: true
                };
            }
        }
    );

    server.registerTool(
        "list_locators",
        {
            description: "Retrieve Locators for a given URL or Page, along with expected state.",
            inputSchema: {
                url: z.string().optional().describe("Filter locators by the exact page URL."),
                search: z.string().optional().describe("Search for locators by name or selector.")
            }
        },
        async ({ url, search }) => {
            try {
                const where: any = {};
                if (url) where.page = { url };
                if (search) {
                    where.OR = [
                        { name: { contains: search } },
                        { originalCss: { contains: search } },
                        { originalXpath: { contains: search } },
                    ];
                }

                const locators = await prisma.locator.findMany({
                    where,
                    include: {
                        page: { include: { project: true } },
                        snapshots: { take: 1, orderBy: { id: 'desc' } },
                    },
                });

                const result = locators.map((loc: any) => ({
                    id: loc.id,
                    name: loc.name,
                    css: loc.originalCss || '',
                    xpath: loc.originalXpath || '',
                    status: loc.status,
                    message: loc.message || '',
                    aiContext: loc.aiContext || '',
                    screenshot: loc.screenshot || '',
                    snapshots: loc.snapshots,
                    page: {
                        url: loc.page.url,
                        path: loc.page.path,
                    },
                    project: {
                        hostname: loc.page.project.hostname,
                    },
                }));

                return {
                    content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error fetching locators: ${error.message}` }],
                    isError: true
                };
            }
        }
    );

    server.registerTool(
        "update_locator",
        {
            description: "Update an existing locator's properties such as its selectors, name, or status.",
            inputSchema: {
                id: z.string().describe("The unique ID of the locator to update."),
                name: z.string().optional().describe("The new name for the locator."),
                originalCss: z.string().optional().describe("The new CSS selector. If this field is provided, then send originalXpath as null."),
                originalXpath: z.string().optional().describe("The new XPath selector. If this field is provided, then send originalCss as null."),
                status: z.enum(['healthy', 'broken', 'multiple']).optional().describe("The new status (e.g., 'healthy', 'broken', 'multiple')."),
                message: z.string().optional().describe("Optional status message or error details."),
                aiContext: z.string().optional().describe("AI generation context or description.")
            }
        },
        async ({ id, name, originalCss, originalXpath, status, message, aiContext }) => {
            try {
                const data: any = {};
                if (name !== undefined) data.name = name;
                if (originalCss !== undefined) data.originalCss = originalCss;
                if (originalXpath !== undefined) data.originalXpath = originalXpath;
                if (status !== undefined) data.status = status;
                if (message !== undefined) data.message = message;
                if (aiContext !== undefined) data.aiContext = aiContext;

                if (Object.keys(data).length === 0) {
                    return {
                        content: [{ type: "text", text: "No fields provided to update." }],
                        isError: true
                    };
                }

                const updatedLocator = await prisma.locator.update({
                    where: { id },
                    data,
                });

                return {
                    content: [{ type: "text", text: JSON.stringify(updatedLocator, null, 2) }]
                };
            } catch (error: any) {
                return {
                    content: [{ type: "text", text: `Error updating locator: ${error.message}` }],
                    isError: true
                };
            }
        }
    );

    return server;
}

export function initMcp(app: Express, prisma: PrismaClient) {
    app.post("/mcp", async (req, res) => {
        const server = createMcpServer(prisma);
        try {
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined
            });
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            res.on('close', () => {
                transport.close();
                server.close();
            });
        } catch (error) {
            console.error('Error handling MCP request:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal server error'
                    },
                    id: null
                });
            }
        }
    });

    app.get("/mcp", async (req, res) => {
        res.status(405).json({
            jsonrpc: '2.0',
            error: {
                code: -32000,
                message: 'Method not allowed. Use POST /mcp for stateless streamable HTTP requests.'
            },
            id: null
        });
    });

    console.log("Seismite MCP Server loaded at /mcp (Stateless McpServer)");
}

