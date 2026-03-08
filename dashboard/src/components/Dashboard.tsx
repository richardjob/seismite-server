import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { XCircle, AlertTriangle, CheckCircle2, Search, Filter, Plus, FileCode2, Trash2, ChevronLeft, ChevronRight, Globe, LayoutDashboard, Camera, Copy, Check } from 'lucide-react';
import { getApiUrl } from '../utils/config';

interface Locator {
    id: string;
    name: string;
    type: 'css' | 'xpath';
    locator: string;
    status: string;
    lastChecked: string;
    hasAiContext?: boolean;
    hasScreenshot?: boolean;
    page: { id: string; url: string; path: string; title: string };
    project: { id: string; hostname: string; name: string };
}

interface Project {
    id: string;
    hostname: string;
    name: string;
    pageCount: number;
    locatorCount: number;
    createdAt: string;
}

export default function Dashboard() {
    const [activeTab, setActiveTab] = useState<'overview' | 'locators'>('locators');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [searchInput, setSearchInput] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 10;
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const queryClient = useQueryClient();

    // Debounce search input by 350ms, reset to page 1 on new query
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(searchInput);
            setPage(1);
        }, 350);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [searchInput]);



    // Live projects list
    const { data: projects = [], isError: isProjectsError } = useQuery<Project[]>({
        queryKey: ['projects'],
        queryFn: async () => {
            const res = await fetch(`${getApiUrl()}/api/projects`);
            if (!res.ok) throw new Error('Failed to fetch projects');
            return res.json();
        },
        refetchInterval: 10000,
        retry: 1,
    });



    // Backend-driven search + pagination (scoped to selected project)
    const { data: apiResponse, isLoading: loading } = useQuery<{ data: Locator[]; total: number; page: number; totalPages: number }>({
        queryKey: ['locators', debouncedSearch, page, selectedProjectId],
        queryFn: async () => {
            const params = new URLSearchParams({
                page: String(page),
                limit: String(PAGE_SIZE),
                ...(debouncedSearch ? { search: debouncedSearch } : {}),
                ...(selectedProjectId ? { projectId: selectedProjectId } : {}),
            });
            const res = await fetch(`${getApiUrl()}/api/locators?${params}`);
            if (!res.ok) throw new Error('Failed to fetch locators');
            return res.json();
        },
        refetchInterval: 5000,
        placeholderData: prev => prev,
    });

    const locators: Locator[] = apiResponse?.data ?? [];
    const total: number = apiResponse?.total ?? 0;
    const totalPages: number = apiResponse?.totalPages ?? 1;

    // Delete Mutation
    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const res = await fetch(`${getApiUrl()}/api/locators/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete locator');
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['locators'] });
        }
    });

    const [editingLocator, setEditingLocator] = useState<Locator | null>(null);
    const [editType, setEditType] = useState<'css' | 'xpath'>('css');
    const [editValue, setEditValue] = useState('');
    const [editError, setEditError] = useState<string | null>(null);

    const openEditModal = (locator: Locator) => {
        setEditingLocator(locator);
        setEditType(locator.type);
        setEditValue(locator.locator);
    };

    const closeEditModal = () => {
        setEditingLocator(null);
        setEditValue('');
        setEditError(null);
    };

    // Edit Mutation
    const editMutation = useMutation({
        mutationFn: async ({ id, type, value }: { id: string; type: 'css' | 'xpath'; value: string }) => {
            const res = await fetch(`${getApiUrl()}/api/locators/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: type,
                    locator: value,
                    expectedSnapshot: {
                        tagName: 'unknown',
                        attributes: {},
                        innerTextHash: ''
                    }
                })
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error || `Failed to update locator (HTTP ${res.status})`);
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['locators'] });
            closeEditModal();
        },
        onError: (err: Error) => {
            setEditError(err.message);
        }
    });

    // Add state
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [addProjectId, setAddProjectId] = useState<string>('');
    const [addPageUrl, setAddPageUrl] = useState<string>('');
    const [addName, setAddName] = useState('');
    const [addType, setAddType] = useState<'css' | 'xpath'>('css');
    const [addValue, setAddValue] = useState('');
    const [addError, setAddError] = useState<string | null>(null);

    const [viewingScreenshotId, setViewingScreenshotId] = useState<string | null>(null);

    const { data: addProjectDetails } = useQuery<{ pages: { id: string; url: string; path: string; title: string }[] }>({
        queryKey: ['projectDetails', addProjectId],
        queryFn: async () => {
            const res = await fetch(`${getApiUrl()}/api/projects/${addProjectId}`);
            if (!res.ok) throw new Error('Failed to fetch project details');
            return res.json();
        },
        enabled: !!addProjectId,
    });

    const closeAddModal = () => {
        setIsAddModalOpen(false);
        setAddProjectId('');
        setAddPageUrl('');
        setAddName('');
        setAddValue('');
        setAddType('css');
        setAddError(null);
    };

    // Add Mutation
    const addMutation = useMutation({
        mutationFn: async () => {
            const res = await fetch(`${getApiUrl()}/api/locators`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: addName,
                    url: addPageUrl,
                    type: addType,
                    locator: addValue,
                    expectedSnapshot: {
                        tagName: 'unknown',
                        attributes: {},
                        innerTextHash: ''
                    }
                })
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error || `Failed to create locator (HTTP ${res.status})`);
            }
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['locators'] });
            queryClient.invalidateQueries({ queryKey: ['projects'] });
            closeAddModal();
        },
        onError: (err: Error) => {
            setAddError(err.message);
        }
    });

    const getStatusStyle = (status: string) => {
        switch (status) {
            case 'healthy': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
            case 'multiple': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
            case 'broken': return 'bg-red-500/10 text-red-400 border-red-500/20';
            default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'healthy': return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
            case 'multiple': return <AlertTriangle className="w-4 h-4 text-amber-400" />;
            case 'broken': return <XCircle className="w-4 h-4 text-red-400" />;
            default: return null;
        }
    };

    const healthyCount = locators.filter(l => l.status === 'healthy').length;
    const multipleCount = locators.filter(l => l.status === 'multiple').length;
    const brokenCount = locators.filter(l => l.status === 'broken').length;

    return (
        <div className="flex h-screen bg-slate-950 text-slate-300 font-sans overflow-hidden">



            {/* Add Modal */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-6">
                        <h2 className="text-lg font-semibold text-white mb-5">Add New Locator</h2>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                    Project
                                </label>
                                <select
                                    className="w-full bg-slate-950 border border-slate-700 text-sm text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                                    value={addProjectId}
                                    onChange={(e) => {
                                        setAddProjectId(e.target.value);
                                        setAddPageUrl('');
                                    }}
                                >
                                    <option value="" disabled>Select a project</option>
                                    {projects.map(p => (
                                        <option key={p.id} value={p.id}>{p.hostname}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                    Sub Project (Page)
                                </label>
                                <select
                                    className="w-full bg-slate-950 border border-slate-700 text-sm text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500"
                                    value={addPageUrl}
                                    onChange={(e) => setAddPageUrl(e.target.value)}
                                    disabled={!addProjectId}
                                >
                                    <option value="" disabled>Select a page</option>
                                    {addProjectDetails?.pages.map((pg: any) => (
                                        <option key={pg.id} value={pg.url}>{pg.path}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                    Locator Name
                                </label>
                                <input
                                    type="text"
                                    value={addName}
                                    onChange={e => setAddName(e.target.value)}
                                    placeholder="e.g. Navigation Home Link"
                                    className="w-full bg-slate-950 border border-slate-700 text-sm text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 font-mono"
                                />
                            </div>

                            <div>
                                <div className="flex bg-slate-950 border border-slate-700 rounded-lg p-1 mb-2 w-fit">
                                    <button
                                        onClick={() => { setAddType('css'); setAddValue(''); }}
                                        className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${addType === 'css' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                    >CSS</button>
                                    <button
                                        onClick={() => { setAddType('xpath'); setAddValue(''); }}
                                        className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${addType === 'xpath' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
                                    >XPath</button>
                                </div>
                                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                    {addType === 'css' ? 'CSS Selector' : 'XPath Expression'}
                                </label>
                                <input
                                    type="text"
                                    value={addValue}
                                    onChange={e => setAddValue(e.target.value)}
                                    placeholder={addType === 'css' ? "e.g. button[data-testid='submit']" : "e.g. //button[@id='submit']"}
                                    className="w-full bg-slate-950 border border-slate-700 text-sm text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 font-mono"
                                />
                            </div>
                        </div>

                        {addError && (
                            <div className="mt-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-400">{addError}</p>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3 mt-6">
                            <button
                                onClick={closeAddModal}
                                className="px-4 py-2 text-sm text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => addMutation.mutate()}
                                disabled={addMutation.isPending || !addName.trim() || !addPageUrl || !addValue.trim()}
                                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors shadow-[0_0_12px_rgba(79,70,229,0.3)]"
                            >
                                {addMutation.isPending ? 'Saving...' : 'Add Locator'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {editingLocator && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-lg p-6">
                        <h2 className="text-lg font-semibold text-white mb-1">Edit Locator</h2>
                        <p className="text-sm text-slate-400 mb-5 font-mono">{editingLocator.name}</p>

                        {/* Type Toggle */}
                        <div className="flex bg-slate-950 border border-slate-700 rounded-lg p-1 mb-4 w-fit">
                            <button
                                onClick={() => { setEditType('css'); setEditValue(''); }}
                                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${editType === 'css' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                                    }`}
                            >CSS</button>
                            <button
                                onClick={() => { setEditType('xpath'); setEditValue(''); }}
                                className={`px-4 py-1.5 text-xs font-medium rounded-md transition-colors ${editType === 'xpath' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                                    }`}
                            >XPath</button>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5">
                                {editType === 'css' ? 'CSS Selector' : 'XPath Expression'}
                            </label>
                            <input
                                type="text"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                placeholder={editType === 'css' ? "e.g. button[data-testid='submit']" : "e.g. //button[@id='submit']"}
                                className="w-full bg-slate-950 border border-slate-700 text-sm text-white rounded-lg px-3 py-2.5 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-mono"
                            />
                        </div>



                        {editError && (
                            <div className="mt-3 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start gap-2">
                                <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                                <p className="text-sm text-red-400">{editError}</p>
                            </div>
                        )}

                        <div className="flex items-center justify-end gap-3 mt-6">
                            <button
                                onClick={closeEditModal}
                                className="px-4 py-2 text-sm text-slate-300 hover:text-white border border-slate-700 hover:border-slate-500 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => editMutation.mutate({ id: editingLocator.id, type: editType, value: editValue })}
                                disabled={editMutation.isPending || !editValue.trim()}
                                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors shadow-[0_0_12px_rgba(79,70,229,0.3)]"
                            >
                                {editMutation.isPending ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Screenshot Modal */}
            {viewingScreenshotId && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 cursor-zoom-out"
                    onClick={() => setViewingScreenshotId(null)}
                >
                    <div className="relative max-w-5xl max-h-[90vh] w-full rounded-xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-950 flex flex-col cursor-default" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900/50">
                            <h3 className="text-white font-medium">Element Context Thumbnail</h3>
                            <button
                                onClick={() => setViewingScreenshotId(null)}
                                className="p-1 text-slate-400 hover:text-white transition-colors bg-slate-800 hover:bg-slate-700 rounded-md"
                            >
                                <XCircle className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-4 overflow-auto flex justify-center bg-slate-950">
                            <img
                                src={`http://localhost:3000/api/locators/${viewingScreenshotId}/screenshot`}
                                className="max-w-full h-auto rounded-lg object-contain shadow-lg border border-slate-800"
                                alt="AI Context"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Sidebar */}
            <aside className="w-64 border-r border-slate-800 bg-slate-950 flex flex-col">
                {/* Logo */}
                <div className="h-20 flex items-center px-6 border-b border-slate-800">
                    <div className="flex items-center space-x-3">
                        <img src="/logo.png" alt="Seismite Logo" className="w-10 h-10 object-contain" />
                        <span className="text-xl font-bold text-white tracking-tight">Seismite</span>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-4">
                    {/* Navigation */}
                    <nav className="px-3 space-y-1">
                        <button
                            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'overview' ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                                }`}
                            onClick={() => setActiveTab('overview')}
                        >
                            <LayoutDashboard className="w-5 h-5 mr-3" />
                            Overview
                        </button>
                        <button
                            className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${activeTab === 'locators' ? 'bg-indigo-500/10 text-indigo-400' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                                }`}
                            onClick={() => setActiveTab('locators')}
                        >
                            <FileCode2 className="w-5 h-5 mr-3" />
                            Locator Library
                        </button>
                    </nav>

                    {/* Projects */}
                    <div className="mt-6 px-3">
                        <div className="flex items-center justify-between px-2 mb-2">
                            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Projects</h3>
                            {selectedProjectId && (
                                <button
                                    onClick={() => { setSelectedProjectId(null); setPage(1); }}
                                    className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                                >
                                    Clear
                                </button>
                            )}
                        </div>

                        {projects.length === 0 ? (
                            <p className="px-2 text-xs text-slate-600 italic">No projects yet</p>
                        ) : (
                            <div className="space-y-0.5">
                                {projects.map(proj => (
                                    <button
                                        key={proj.id}
                                        onClick={() => {
                                            setSelectedProjectId(selectedProjectId === proj.id ? null : proj.id);
                                            setPage(1);
                                        }}
                                        className={`w-full flex items-start gap-2.5 px-2 py-2 rounded-lg text-left transition-colors ${selectedProjectId === proj.id
                                            ? 'bg-indigo-500/10 text-indigo-300'
                                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                                            }`}
                                    >
                                        <Globe className="w-4 h-4 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium truncate">{proj.hostname}</div>
                                            <div className="text-xs text-slate-500 mt-0.5">{proj.pageCount} page{proj.pageCount !== 1 ? 's' : ''}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer: API status */}
                <div className="p-4 border-t border-slate-800">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isProjectsError ? 'bg-red-500' : 'bg-emerald-400 animate-pulse'}`}></span>
                        <span className="text-xs text-slate-400">{isProjectsError ? 'API Disconnected' : 'API connected'}</span>
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col bg-[#0b1120] relative">
                {/* Top Header */}
                <header className="h-16 flex items-center justify-between px-8 border-b border-slate-800/60 bg-slate-950/50 backdrop-blur-sm z-10">
                    <div>
                        <h1 className="text-lg font-semibold text-white">
                            {activeTab === 'overview' ? 'Overview' : 'Locator Library'}
                        </h1>
                        {selectedProjectId && (
                            <p className="text-xs text-slate-500 mt-0.5">
                                Filtered by: <span className="text-indigo-400">{projects.find(p => p.id === selectedProjectId)?.hostname}</span>
                            </p>
                        )}
                    </div>
                    <div className="flex items-center space-x-4">
                        {activeTab === 'locators' && (
                            <button
                                onClick={() => setIsAddModalOpen(true)}
                                className="flex items-center px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-[0_0_15px_rgba(79,70,229,0.3)]"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Track New Element
                            </button>
                        )}
                    </div>
                </header>

                {/* Content Body */}
                <div className="flex-1 overflow-y-auto p-8 relative">

                    {/* ── OVERVIEW TAB ── */}
                    {activeTab === 'overview' && (
                        <>
                            <div className="grid grid-cols-3 gap-6 mb-8">
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <p className="text-sm font-medium text-slate-400">Projects</p>
                                            <h3 className="text-3xl font-bold text-white mt-2">{projects.length}</h3>
                                        </div>
                                        <div className="p-2 bg-indigo-500/20 rounded-lg"><Globe className="w-6 h-6 text-indigo-400" /></div>
                                    </div>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <p className="text-sm font-medium text-slate-400">Total Pages</p>
                                            <h3 className="text-3xl font-bold text-white mt-2">{projects.reduce((s, p) => s + p.pageCount, 0)}</h3>
                                        </div>
                                        <div className="p-2 bg-violet-500/20 rounded-lg"><FileCode2 className="w-6 h-6 text-violet-400" /></div>
                                    </div>
                                </div>
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <p className="text-sm font-medium text-slate-400">Total Locators</p>
                                            <h3 className="text-3xl font-bold text-white mt-2">{total}</h3>
                                        </div>
                                        <div className="p-2 bg-emerald-500/20 rounded-lg"><CheckCircle2 className="w-6 h-6 text-emerald-400" /></div>
                                    </div>
                                </div>
                            </div>

                            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Projects</h2>
                            <div className="grid grid-cols-1 gap-4">
                                {projects.map(proj => (
                                    <div key={proj.id} className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-between hover:border-slate-700 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-500/10 rounded-lg"><Globe className="w-5 h-5 text-indigo-400" /></div>
                                            <div>
                                                <div className="font-medium text-white">{proj.hostname}</div>
                                                <div className="text-xs text-slate-500 mt-0.5">Created {new Date(proj.createdAt).toLocaleDateString()}</div>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6">
                                            <div className="text-right">
                                                <div className="text-lg font-bold text-white">{proj.pageCount}</div>
                                                <div className="text-xs text-slate-500">Pages</div>
                                            </div>
                                            <button
                                                onClick={() => { setSelectedProjectId(proj.id); setActiveTab('locators'); setPage(1); }}
                                                className="px-3 py-1.5 text-xs font-medium bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 rounded-lg transition-colors border border-indigo-500/20"
                                            >
                                                View Locators →
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ── LOCATORS TAB ── */}
                    {activeTab === 'locators' && (
                        <>
                            {/* Stats Row */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <p className="text-sm font-medium text-slate-400">Healthy Locators</p>
                                            <h3 className="text-3xl font-bold text-white mt-2">{loading ? '...' : healthyCount}</h3>
                                        </div>
                                        <div className="p-2 bg-emerald-500/20 rounded-lg">
                                            <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <p className="text-sm font-medium text-slate-400">Multiple Matches</p>
                                            <h3 className="text-3xl font-bold text-white mt-2">{loading ? '...' : multipleCount}</h3>
                                        </div>
                                        <div className="p-2 bg-amber-500/20 rounded-lg">
                                            <AlertTriangle className="w-6 h-6 text-amber-400" />
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/10 rounded-full blur-3xl -mr-10 -mt-10" />
                                    <div className="flex justify-between items-start relative z-10">
                                        <div>
                                            <p className="text-sm font-medium text-slate-400">Broken</p>
                                            <h3 className="text-3xl font-bold text-white mt-2">{loading ? '...' : brokenCount}</h3>
                                        </div>
                                        <div className="p-2 bg-red-500/20 rounded-lg">
                                            <XCircle className="w-6 h-6 text-red-400" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Table Area */}
                            <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-xl overflow-hidden">
                                <div className="px-6 py-4 flex items-center justify-between border-b border-slate-800">
                                    <div className="flex items-center space-x-2">
                                        <div className="relative">
                                            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                                            <input
                                                type="text"
                                                value={searchInput}
                                                onChange={e => setSearchInput(e.target.value)}
                                                placeholder="Search by name or locator..."
                                                className="bg-slate-950 border border-slate-700 text-sm text-white rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 w-64"
                                            />
                                        </div>
                                        <button className="p-2 text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg transition-colors">
                                            <Filter className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="text-sm text-slate-400">
                                        {debouncedSearch
                                            ? `${total} result${total !== 1 ? 's' : ''} for "${debouncedSearch}"`
                                            : `${total} locator${total !== 1 ? 's' : ''} total`}
                                    </div>
                                </div>

                                <div className="overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider">
                                                <th className="px-6 py-4 font-medium">Locator Name</th>
                                                <th className="px-6 py-4 font-medium">Locator</th>
                                                <th className="px-6 py-4 font-medium">Status</th>
                                                <th className="px-6 py-4 font-medium">Page</th>
                                                <th className="px-6 py-4 font-medium">Project</th>
                                                <th className="px-6 py-4 font-medium">Last Checked</th>
                                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-800">
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                                                        <div className="animate-pulse flex flex-col items-center">
                                                            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                                                            <div className="text-sm">Fetching locators from database...</div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : locators.length === 0 ? (
                                                <tr>
                                                    <td colSpan={7} className="px-6 py-8 text-center text-slate-500">
                                                        {total === 0 && !debouncedSearch
                                                            ? 'No trackers found for this project.'
                                                            : `No results for "${debouncedSearch}".`}
                                                    </td>
                                                </tr>
                                            ) : locators.map((locator) => (
                                                <tr key={locator.id} className="group hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="font-medium text-white">{locator.name}</div>
                                                    </td>
                                                    <td className="px-6 py-4 max-w-xs">
                                                        <div className="flex items-center gap-2">
                                                            <span className={`shrink-0 px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide ${locator.type === 'css' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-amber-500/15 text-amber-400'
                                                                }`}>
                                                                {locator.type === 'css' ? 'CSS' : 'XPath'}
                                                            </span>
                                                            <span className="font-mono text-xs text-slate-400 truncate flex-1" title={locator.locator}>
                                                                {locator.locator}
                                                            </span>
                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(locator.locator);
                                                                    setCopiedId(locator.id);
                                                                    setTimeout(() => setCopiedId(null), 2000);
                                                                }}
                                                                className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-md transition-all ${copiedId === locator.id
                                                                    ? 'bg-green-500/20 text-green-400 opacity-100'
                                                                    : 'hover:bg-slate-700 text-slate-400 hover:text-white'
                                                                    }`}
                                                                title="Copy to clipboard"
                                                            >
                                                                {copiedId === locator.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                                                            </button>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusStyle(locator.status)}`}>
                                                            {getStatusIcon(locator.status)}
                                                            <span className="ml-1.5 capitalize">{locator.status.replace('_', ' ')}</span>
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="font-mono text-xs text-slate-300">{locator.page.path}</div>
                                                        <div className="text-xs text-slate-500 mt-0.5" title={locator.page.url}>{locator.page.url}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-300 font-medium">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0"></span>
                                                            {locator.project.hostname}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4 text-sm text-slate-400">{locator.lastChecked}</td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-1 relative">
                                                            {locator.hasScreenshot && (
                                                                <button
                                                                    className="p-2 text-indigo-400 hover:text-indigo-300 transition-colors rounded-lg hover:bg-indigo-500/10"
                                                                    title="View AI Context Screenshot"
                                                                    onClick={() => setViewingScreenshotId(locator.id)}
                                                                >
                                                                    <Camera className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            <button
                                                                className="p-2 text-slate-400 hover:text-indigo-400 transition-colors rounded-lg hover:bg-indigo-500/10"
                                                                onClick={() => openEditModal(locator)}
                                                                title="Edit locator"
                                                            >
                                                                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                                </svg>
                                                            </button>
                                                            <button
                                                                className="p-2 text-slate-400 hover:text-red-400 transition-colors rounded-lg hover:bg-red-500/10"
                                                                onClick={() => deleteMutation.mutate(locator.id)}
                                                                disabled={deleteMutation.isPending}
                                                                title="Delete locator"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between">
                                        <span className="text-sm text-slate-400">
                                            Page {page} of {totalPages}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                                disabled={page === 1}
                                                className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ChevronLeft className="w-4 h-4" />
                                            </button>

                                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                                                .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                                                    if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                                                    acc.push(p);
                                                    return acc;
                                                }, [])
                                                .map((item, idx) =>
                                                    item === '...' ? (
                                                        <span key={`ellipsis-${idx}`} className="px-2 text-slate-500">…</span>
                                                    ) : (
                                                        <button
                                                            key={item}
                                                            onClick={() => setPage(item as number)}
                                                            className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${page === item
                                                                ? 'bg-indigo-600 text-white'
                                                                : 'border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                                                                }`}
                                                        >
                                                            {item}
                                                        </button>
                                                    )
                                                )
                                            }

                                            <button
                                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                                disabled={page === totalPages}
                                                className="p-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                            >
                                                <ChevronRight className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                </div>
            </main>
        </div >
    );
}
