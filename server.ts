import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import { initMcp } from './mcp';

const prisma = new PrismaClient({
    datasources: {
        db: {
            url: process.env.DATABASE_URL || 'file:./prisma/default.db',
        },
    },
});
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', message: 'Seismite API is running' });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Extract hostname from a full URL (no port, no protocol, no subdomain stripping). */
function extractHostname(url: string): string {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}

/** Extract pathname from a full URL, defaults to '/'. */
function extractPath(url: string): string {
    try {
        return new URL(url).pathname || '/';
    } catch {
        return '/';
    }
}

/**
 * Find or create the Project (by hostname) and Page (by full URL),
 * returning the Page record.
 */
async function findOrCreatePage(fullUrl: string) {
    const hostname = extractHostname(fullUrl);
    const path = extractPath(fullUrl);

    // Upsert project by hostname
    const project = await prisma.project.upsert({
        where: { hostname },
        update: {},
        create: { hostname, name: hostname },
    });

    // Upsert page by (projectId, url)
    const page = await prisma.page.upsert({
        where: { projectId_url: { projectId: project.id, url: fullUrl } },
        update: {},
        create: { projectId: project.id, url: fullUrl, path },
    });

    return { project, page };
}

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const LocatorCreateSchema = z.object({
    name: z.string(),
    url: z.string().url(),
    type: z.enum(['css', 'xpath']),
    locator: z.string(),
    aiContext: z.string().nullable().optional(),
    screenshot: z.string().nullable().optional(),
    expectedSnapshot: z.object({
        tagName: z.string(),
        attributes: z.record(z.string(), z.string()),
        innerTextHash: z.string().optional().default(''),
    }),
});

const LocatorUpdateSchema = z.object({
    type: z.enum(['css', 'xpath']),
    locator: z.string(),
    aiContext: z.string().nullable().optional(),
    screenshot: z.string().nullable().optional(),
    expectedSnapshot: z.object({
        tagName: z.string(),
        attributes: z.record(z.string(), z.string()),
        innerTextHash: z.string().optional().default(''),
    }),
});

const HeartbeatResultSchema = z.array(z.object({
    locatorId: z.string(),
    status: z.string(),
    message: z.string().optional(),
}));

// ─── Projects ─────────────────────────────────────────────────────────────────

/** GET /api/projects — list all projects with page count */
app.get('/api/projects', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const projects = await prisma.project.findMany({
            include: {
                _count: { select: { pages: true } },
                pages: { include: { _count: { select: { locators: true } } } },
            },
            orderBy: { createdAt: 'desc' },
        });

        const result = projects
            .map((p: any) => ({
                id: p.id,
                hostname: p.hostname,
                name: p.name,
                pageCount: p._count.pages,
                locatorCount: p.pages.reduce((sum: any, pg: any) => sum + pg._count.locators, 0),
                createdAt: p.createdAt,
            }))
            .filter((p: any) => p.locatorCount > 0);

        res.json(result);
    } catch (error) {
        next(error);
    }
});

/** GET /api/projects/:id — get a single project with its pages */
app.get('/api/projects/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const project = await prisma.project.findUnique({
            where: { id: req.params.id as string },
            include: {
                pages: {
                    include: { _count: { select: { locators: true } } },
                    orderBy: { createdAt: 'asc' },
                },
            },
        });

        if (!project) return res.status(404).json({ error: 'Project not found' });

        res.json({
            id: project.id,
            hostname: project.hostname,
            name: project.name,
            pages: (project as any).pages.map((pg: any) => ({
                id: pg.id,
                url: pg.url,
                path: pg.path,
                title: pg.title,
                locatorCount: pg._count.locators,
                createdAt: pg.createdAt,
            })),
        });
    } catch (error) {
        next(error);
    }
});

// ─── Locators ─────────────────────────────────────────────────────────────────

/** GET /api/locators — paginated + searchable. Supports ?pageId=, ?projectId=, ?url=, ?search=, ?page=, ?limit=.
 *  Add ?raw=true to get a flat array with snapshots (used by the extension content script). */
app.get('/api/locators', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { pageId, projectId, url, search, page: pageStr, limit: limitStr, raw } = req.query;

        const isRaw = raw === 'true';
        const page = Math.max(1, parseInt(pageStr as string) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(limitStr as string) || 10));
        const skip = (page - 1) * limit;
        const searchTerm = (search as string | undefined)?.trim() || '';

        const where: any = {};
        if (pageId) where.pageId = pageId as string;
        if (projectId) where.page = { projectId: projectId as string };
        if (url) where.page = { ...(where.page ?? {}), url: url as string };
        if (searchTerm) {
            where.OR = [
                { name: { contains: searchTerm } },
                { locator: { contains: searchTerm } },
            ];
        }

        // Raw mode: flat array with snapshots, no pagination — used by the content script
        if (isRaw) {
            const locators = await prisma.locator.findMany({
                where,
                include: {
                    page: { include: { project: true } },
                    snapshots: { take: 1, orderBy: { id: 'desc' } },
                },
            });

            return res.json(locators.map((loc: any) => ({
                id: loc.id,
                name: loc.name,
                type: loc.type,
                locator: loc.locator,
                status: loc.status,
                message: loc.message || '',
                hasAiContext: !!loc.aiContext,
                hasScreenshot: !!loc.screenshot,
                snapshots: loc.snapshots,
                page: {
                    id: loc.page.id,
                    url: loc.page.url,
                    path: loc.page.path,
                    title: loc.page.title,
                },
                project: {
                    id: loc.page.project.id,
                    hostname: loc.page.project.hostname,
                    name: loc.page.project.name,
                },
            })));
        }

        const [locators, total] = await prisma.$transaction([
            prisma.locator.findMany({
                where,
                skip,
                take: limit,
                orderBy: { lastVerifiedAt: 'desc' },
                include: { page: { include: { project: true } } },
            }),
            prisma.locator.count({ where }),
        ]);

        const data = locators.map((loc: any) => ({
            id: loc.id,
            name: loc.name,
            type: loc.type,
            locator: loc.locator,
            status: loc.status,
            message: loc.message || '',
            hasAiContext: !!loc.aiContext,
            hasScreenshot: !!loc.screenshot,
            lastChecked: loc.lastVerifiedAt.toISOString().split('T')[0],
            page: {
                id: loc.page.id,
                url: loc.page.url,
                path: loc.page.path,
                title: loc.page.title,
            },
            project: {
                id: loc.page.project.id,
                hostname: loc.page.project.hostname,
                name: loc.page.project.name,
            },
        }));

        res.json({ data, total, page, totalPages: Math.ceil(total / limit) });

    } catch (error) {
        next(error);
    }
});

/** GET /api/locators/:id/screenshot — get a locator's full-page screenshot */
app.get('/api/locators/:id/screenshot', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const locator = await prisma.locator.findUnique({
            where: { id: req.params.id as string },
            select: { screenshot: true },
        });

        if (!locator || !locator.screenshot) return res.status(404).json({ error: 'Screenshot not found' });

        const base64Data = locator.screenshot.replace(/^data:image\/\w+;base64,/, "");
        const imgBuffer = Buffer.from(base64Data, 'base64');
        res.writeHead(200, {
            'Content-Type': 'image/jpeg',
            'Content-Length': imgBuffer.length
        });
        res.end(imgBuffer);
    } catch (error) {
        next(error);
    }
});

/** POST /api/locators — auto-creates Project + Page from URL */
app.post('/api/locators', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const body = LocatorCreateSchema.parse(req.body);
        const { page } = await findOrCreatePage(body.url);

        const locator = await prisma.locator.create({
            data: {
                pageId: page.id,
                name: body.name,
                type: body.type,
                locator: body.locator,
                aiContext: body.aiContext,
                screenshot: body.screenshot,
                snapshots: {
                    create: {
                        tagName: body.expectedSnapshot.tagName,
                        attributes: JSON.stringify(body.expectedSnapshot.attributes),
                        innerTextHash: body.expectedSnapshot.innerTextHash,
                    },
                },
            },
        });

        res.json({ message: 'Locator tracked successfully', id: locator.id });
    } catch (error: any) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'A locator with this name already exists on this page.' });
        }
        next(error);
    }
});

/** PUT /api/locators/:id */
app.put('/api/locators/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const id = req.params.id;
        const body = LocatorUpdateSchema.parse(req.body);

        const locator = await prisma.locator.update({
            where: { id: id as string },
            data: {
                type: body.type,
                locator: body.locator,
                aiContext: body.aiContext,
                screenshot: body.screenshot,
                status: 'healthy',
                message: null,
                lastVerifiedAt: new Date(),
                snapshots: {
                    create: {
                        tagName: body.expectedSnapshot.tagName,
                        attributes: JSON.stringify(body.expectedSnapshot.attributes),
                        innerTextHash: body.expectedSnapshot.innerTextHash,
                    },
                },
            },
        });

        res.json({ message: 'Locator updated successfully', id: locator.id });
    } catch (error) {
        next(error);
    }
});

/** DELETE /api/locators/:id */
app.delete('/api/locators/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
        await prisma.locator.delete({ where: { id: req.params.id as string } });
        res.json({ message: 'Locator deleted successfully' });
    } catch (error) {
        next(error);
    }
});

/** POST /api/heartbeat */
app.post('/api/heartbeat', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { results } = req.body;
        console.log(`[API] Received heartbeat with ${results?.length} results:`, JSON.stringify(results, null, 2));

        const validated = HeartbeatResultSchema.parse(results);

        await prisma.$transaction(
            validated.map(r =>
                prisma.locator.update({
                    where: { id: r.locatorId },
                    data: { status: r.status, message: r.message || null, lastVerifiedAt: new Date() },
                })
            )
        );

        console.log(`[API] Successfully updated ${validated.length} locators from heartbeat.`);
        res.json({ message: `Updated ${validated.length} locators` });
    } catch (error) {
        console.error('[API] Heartbeat transaction failed:', error);
        next(error);
    }
});

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function seedDatabase() {
    const count = await prisma.project.count();
    if (count > 0) return;

    console.log('Seeding database...');

    const project = await prisma.project.create({
        data: { hostname: 'acmecorp.com', name: 'Acme Corp' },
    });

    const pages = await Promise.all([
        prisma.page.create({ data: { projectId: project.id, url: 'https://acmecorp.com/login', path: '/login' } }),
        prisma.page.create({ data: { projectId: project.id, url: 'https://acmecorp.com/dashboard', path: '/dashboard' } }),
        prisma.page.create({ data: { projectId: project.id, url: 'https://acmecorp.com/checkout', path: '/checkout' } }),
    ]);

    const [loginPage, dashPage, checkoutPage] = pages;

    await prisma.locator.createMany({
        data: [
            { pageId: loginPage.id, name: 'Login Submit Button', type: 'css', locator: 'button[data-testid="login-submit"]', status: 'healthy' },
            { pageId: loginPage.id, name: 'User Avatar Header', type: 'css', locator: '.header-avatar img', status: 'multiple' },
            { pageId: dashPage.id, name: 'Navigation Home Link', type: 'css', locator: 'a.nav-home', status: 'healthy' },
            { pageId: dashPage.id, name: 'Settings Save Button', type: 'css', locator: 'button.save-btn', status: 'healthy' },
            { pageId: checkoutPage.id, name: 'Checkout Complete Label', type: 'css', locator: '#order-success-msg', status: 'broken' },
        ],
    });

    console.log('Seeding complete.');
}

// ─── Error Handler ────────────────────────────────────────────────────────────

initMcp(app, prisma);

// ─── Static Files & SPA Fallback ──────────────────────────────────────────────

const uiPath = path.join(__dirname, 'dashboard', 'dist');
app.use(express.static(uiPath));

app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(uiPath, 'index.html'));
    } else {
        next();
    }
});
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', err);
    if (err instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation Error', details: err.issues });
    }
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    await seedDatabase();
    console.log(`Seismite API running on http://localhost:${PORT}`);
});
