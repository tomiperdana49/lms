import { useState, useEffect, type FormEvent } from 'react';
import { Settings, Plus, Edit, Trash2, ArrowLeft, Eye, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_BASE_URL } from '../config';
import type { Role, CompetencyTemplate } from '../types';
import PopupNotification from './PopupNotification';
import ConfirmationModal from './ConfirmationModal';

interface CompetencyTemplateManagerProps {
    userRole: Role;
    onBack: () => void;
}

const PINNED_POSITION_OPTIONS = ['Umum', 'Semua Posisi Level Leader'];
const COMPETENCY_TYPE_OPTIONS = ['CORE', 'LEADERSHIP', 'FUNCTIONAL'];

const emptyFormData = {
    competencyType: '',
    position: '',
    competencyName: '',
    operationalDefinition: '',
    standardLevelIndicator: '',
    jdReference: '',
    standardScore: ''
};

const CompetencyTemplateManager = ({ userRole, onBack }: CompetencyTemplateManagerProps) => {
    const { t } = useTranslation('competencyTemplate');
    const [templates, setTemplates] = useState<CompetencyTemplate[]>([]);
    const [positions, setPositions] = useState<string[]>([]);
    const [isPositionDropdownOpen, setIsPositionDropdownOpen] = useState(false);
    const [hasEditedPosition, setHasEditedPosition] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingTemplate, setEditingTemplate] = useState<CompetencyTemplate | null>(null);
    const [formData, setFormData] = useState(emptyFormData);
    const [filterType, setFilterType] = useState('');
    const [filterPosition, setFilterPosition] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [viewingTemplate, setViewingTemplate] = useState<CompetencyTemplate | null>(null);
    const itemsPerPage = 10;
    const [notification, setNotification] = useState<{ show: boolean; type: 'success' | 'error'; message: string }>({ show: false, type: 'success', message: '' });
    const [confirmConfig, setConfirmConfig] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });

    const openConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmConfig({ isOpen: true, title, message, onConfirm });
    };

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [templatesRes, positionsRes] = await Promise.all([
                    fetch(`${API_BASE_URL}/api/competency-templates`),
                    fetch(`${API_BASE_URL}/api/employees/positions`)
                ]);
                if (templatesRes.ok) {
                    const data = await templatesRes.json();
                    if (Array.isArray(data)) setTemplates(data);
                }
                if (positionsRes.ok) {
                    const data = await positionsRes.json();
                    if (Array.isArray(data)) setPositions(data);
                }
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: t('notifications.loadFailed') });
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        try {
            if (editingTemplate) {
                const res = await fetch(`${API_BASE_URL}/api/competency-templates/${editingTemplate.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                if (res.ok) {
                    const updated = await res.json();
                    setTemplates(templates.map(item => item.id === updated.id ? updated : item));
                    setIsFormOpen(false);
                    setEditingTemplate(null);
                    setFormData(emptyFormData);
                    setNotification({ show: true, type: 'success', message: t('notifications.updateSuccess') });
                } else {
                    setNotification({ show: true, type: 'error', message: t('notifications.updateFailed') });
                }
            } else {
                const res = await fetch(`${API_BASE_URL}/api/competency-templates`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                if (res.ok) {
                    const created = await res.json();
                    setTemplates([created, ...templates]);
                    setIsFormOpen(false);
                    setFormData(emptyFormData);
                    setNotification({ show: true, type: 'success', message: t('notifications.createSuccess') });
                } else {
                    setNotification({ show: true, type: 'error', message: t('notifications.createFailed') });
                }
            }
        } catch (err) {
            console.error(err);
        }
    };

    const positionOptions = [...PINNED_POSITION_OPTIONS, ...positions];
    const filteredPositions = (hasEditedPosition && formData.position)
        ? positionOptions.filter(pos => pos.toLowerCase().includes(formData.position.toLowerCase()))
        : positionOptions;

    const filterTypeOptions = Array.from(new Set(templates.map(item => item.competencyType).filter(Boolean))).sort();
    const filterPositionOptions = Array.from(new Set(templates.map(item => item.position).filter(Boolean))).sort();
    const visibleTemplates = templates.filter(item =>
        (!filterType || item.competencyType === filterType) &&
        (!filterPosition || item.position === filterPosition)
    );
    const totalPages = Math.max(1, Math.ceil(visibleTemplates.length / itemsPerPage));
    const paginatedTemplates = visibleTemplates.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handleEdit = (template: CompetencyTemplate) => {
        setEditingTemplate(template);
        setFormData({
            competencyType: template.competencyType || '',
            position: template.position || '',
            competencyName: template.competencyName || '',
            operationalDefinition: template.operationalDefinition || '',
            standardLevelIndicator: template.standardLevelIndicator || '',
            jdReference: template.jdReference || '',
            standardScore: template.standardScore ? String(template.standardScore) : ''
        });
        setHasEditedPosition(false);
        setIsFormOpen(true);
    };

    const handleDelete = (template: CompetencyTemplate) => {
        openConfirm(t('confirm.deleteTitle'), t('confirm.deleteMessage'), async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/competency-templates/${template.id}`, { method: 'DELETE' });
                if (res.ok) {
                    setTemplates(templates.filter(item => item.id !== template.id));
                    setNotification({ show: true, type: 'success', message: t('notifications.deleteSuccess') });
                } else {
                    setNotification({ show: true, type: 'error', message: t('notifications.deleteFailed') });
                }
            } catch (err) {
                console.error(err);
                setNotification({ show: true, type: 'error', message: t('notifications.deleteFailed') });
            }
        });
    };

    if (userRole !== 'HR' && userRole !== 'HR_ADMIN') {
        return <div className="p-8 text-center text-red-500">{t('accessDenied')}</div>;
    }

    if (isLoading) return <div className="p-8 text-center">{t('loading')}</div>;

    return (
        <div className="max-w-6xl mx-auto py-6">
            <PopupNotification
                isOpen={notification.show}
                type={notification.type}
                message={notification.message}
                onClose={() => setNotification({ ...notification, show: false })}
            />
            <button onClick={onBack} className="text-sm text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-4 transition-colors">
                <ArrowLeft size={14} /> {t('backToDashboard')}
            </button>

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Settings className="text-indigo-600" /> {t('title')}
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">{t('subtitle', { count: templates.length })}</p>
                </div>
                <button
                    onClick={() => {
                        setEditingTemplate(null);
                        setFormData(emptyFormData);
                        setHasEditedPosition(false);
                        setIsFormOpen(true);
                    }}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-indigo-900/20 flex items-center gap-2 whitespace-nowrap"
                >
                    <Plus size={18} /> {t('addTemplate')}
                </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <select
                    value={filterType}
                    onChange={e => { setFilterType(e.target.value); setCurrentPage(1); }}
                    className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm text-slate-700"
                >
                    <option value="">{t('filters.allTypes')}</option>
                    {filterTypeOptions.map(type => (
                        <option key={type} value={type}>{type}</option>
                    ))}
                </select>
                <select
                    value={filterPosition}
                    onChange={e => { setFilterPosition(e.target.value); setCurrentPage(1); }}
                    className="px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm text-slate-700"
                >
                    <option value="">{t('filters.allPositions')}</option>
                    {filterPositionOptions.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                    ))}
                </select>
                {(filterType || filterPosition) && (
                    <button
                        onClick={() => { setFilterType(''); setFilterPosition(''); setCurrentPage(1); }}
                        className="text-sm text-slate-500 hover:text-indigo-600 font-medium px-2"
                    >
                        {t('filters.reset')}
                    </button>
                )}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4">
                <table className="w-full text-sm table-fixed">
                    <colgroup>
                        <col className="w-[100px]" />
                        <col className="w-[13%]" />
                        <col className="w-[15%]" />
                        <col className="w-[17%]" />
                        <col className="w-[17%]" />
                        <col className="w-[11%]" />
                        <col className="w-[70px]" />
                        <col className="w-[90px]" />
                    </colgroup>
                    <thead>
                        <tr className="bg-slate-50 border-b border-slate-100 text-left font-semibold text-slate-600">
                            <th className="p-4">{t('table.competencyType')}</th>
                            <th className="p-4">{t('table.position')}</th>
                            <th className="p-4">{t('table.competencyName')}</th>
                            <th className="p-4">{t('table.operationalDefinition')}</th>
                            <th className="p-4">{t('table.standardLevelIndicator')}</th>
                            <th className="p-4">{t('table.jdReference')}</th>
                            <th className="p-4">{t('table.standardScore')}</th>
                            <th className="p-4 text-center">{t('table.action')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {paginatedTemplates.map(template => (
                            <tr key={template.id} className="hover:bg-slate-50 transition-colors align-top">
                                <td className="p-4 text-slate-700 whitespace-nowrap">{template.competencyType}</td>
                                <td className="p-4 text-slate-700 break-words">{template.position}</td>
                                <td className="p-4 font-semibold text-slate-800 break-words">{template.competencyName}</td>
                                <td className="p-4 text-slate-600">
                                    <div className="break-words line-clamp-3">{template.operationalDefinition}</div>
                                </td>
                                <td className="p-4 text-slate-600">
                                    <div className="break-words line-clamp-3">{template.standardLevelIndicator}</div>
                                </td>
                                <td className="p-4 text-slate-700">
                                    <div className="break-words line-clamp-3">{template.jdReference}</div>
                                </td>
                                <td className="p-4 text-slate-700 text-center">{template.standardScore ?? '-'}</td>
                                <td className="p-4">
                                    <div className="flex justify-center gap-1">
                                        <button
                                            onClick={() => setViewingTemplate(template)}
                                            className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                            title={t('actions.view')}
                                        >
                                            <Eye size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleEdit(template)}
                                            className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                            title={t('actions.edit')}
                                        >
                                            <Edit size={18} />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(template)}
                                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                            title={t('actions.delete')}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {visibleTemplates.length === 0 && (
                    <div className="p-8 text-center text-slate-500 italic">
                        {templates.length === 0 ? t('noData') : t('noFilterResults')}
                    </div>
                )}
            </div>

            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-2 mb-8">
                    <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft size={18} />
                    </button>
                    <span className="px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-600">
                        {t('pagination', { current: currentPage, total: totalPages })}
                    </span>
                    <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <ChevronRight size={18} />
                    </button>
                </div>
            )}

            {isFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="font-bold text-lg text-slate-800">{editingTemplate ? t('modal.editTitle') : t('modal.addTitle')}</h2>
                            <button onClick={() => { setIsFormOpen(false); setEditingTemplate(null); }} className="text-slate-400 hover:text-slate-600">{t('modal.close')}</button>
                        </div>
                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div className="relative">
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('modal.position')}</label>
                                <input
                                    required
                                    value={formData.position}
                                    onChange={e => { setFormData({ ...formData, position: e.target.value }); setHasEditedPosition(true); setIsPositionDropdownOpen(true); }}
                                    onFocus={() => setIsPositionDropdownOpen(true)}
                                    onBlur={() => setTimeout(() => setIsPositionDropdownOpen(false), 150)}
                                    placeholder={t('modal.selectPosition')}
                                    autoComplete="off"
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                {isPositionDropdownOpen && filteredPositions.length > 0 && (
                                    <div className="absolute z-10 top-full left-0 right-0 mt-1 max-h-52 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg">
                                        {filteredPositions.map(pos => (
                                            <button
                                                key={pos}
                                                type="button"
                                                onMouseDown={e => e.preventDefault()}
                                                onClick={() => { setFormData({ ...formData, position: pos }); setHasEditedPosition(true); setIsPositionDropdownOpen(false); }}
                                                className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                                            >
                                                {pos}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('modal.competencyType')}</label>
                                <select
                                    required
                                    value={formData.competencyType}
                                    onChange={e => setFormData({ ...formData, competencyType: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                    <option value="">{t('modal.selectCompetencyType')}</option>
                                    {COMPETENCY_TYPE_OPTIONS.map(type => (
                                        <option key={type} value={type}>{type}</option>
                                    ))}
                                    {formData.competencyType && !COMPETENCY_TYPE_OPTIONS.includes(formData.competencyType) && (
                                        <option value={formData.competencyType}>{formData.competencyType}</option>
                                    )}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('modal.competencyName')}</label>
                                <input
                                    required
                                    value={formData.competencyName}
                                    onChange={e => setFormData({ ...formData, competencyName: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('modal.operationalDefinition')}</label>
                                <textarea
                                    value={formData.operationalDefinition}
                                    onChange={e => setFormData({ ...formData, operationalDefinition: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 resize-none min-h-[80px]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('modal.standardLevelIndicator')}</label>
                                <textarea
                                    value={formData.standardLevelIndicator}
                                    onChange={e => setFormData({ ...formData, standardLevelIndicator: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 resize-none min-h-[80px]"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('modal.jdReference')}</label>
                                <input
                                    value={formData.jdReference}
                                    onChange={e => setFormData({ ...formData, jdReference: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1">{t('modal.standardScore')}</label>
                                <select
                                    value={formData.standardScore}
                                    onChange={e => setFormData({ ...formData, standardScore: e.target.value })}
                                    className="w-full px-4 py-2 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                                >
                                    <option value="">{t('modal.selectStandardScore')}</option>
                                    <option value="1">1 - {t('scoreLabels.1')}</option>
                                    <option value="2">2 - {t('scoreLabels.2')}</option>
                                    <option value="3">3 - {t('scoreLabels.3')}</option>
                                    <option value="4">4 - {t('scoreLabels.4')}</option>
                                </select>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => { setIsFormOpen(false); setEditingTemplate(null); }}
                                    className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50"
                                >
                                    {t('modal.cancel')}
                                </button>
                                <button className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/20">
                                    {t('modal.save')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {viewingTemplate && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <h2 className="font-bold text-lg text-slate-800">{t('modal.detailTitle')}</h2>
                            <button onClick={() => setViewingTemplate(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">{t('modal.competencyType')}</p>
                                <p className="text-slate-600">{viewingTemplate.competencyType}</p>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">{t('modal.position')}</p>
                                <p className="text-slate-600">{viewingTemplate.position}</p>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">{t('modal.competencyName')}</p>
                                <p className="text-slate-600">{viewingTemplate.competencyName}</p>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">{t('modal.operationalDefinition')}</p>
                                <p className="text-slate-600 whitespace-pre-wrap">{viewingTemplate.operationalDefinition}</p>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">{t('modal.standardLevelIndicator')}</p>
                                <p className="text-slate-600 whitespace-pre-wrap">{viewingTemplate.standardLevelIndicator}</p>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">{t('modal.jdReference')}</p>
                                <p className="text-slate-600 whitespace-pre-wrap">{viewingTemplate.jdReference}</p>
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-700 mb-1">{t('modal.standardScore')}</p>
                                <p className="text-slate-600">{viewingTemplate.standardScore ?? '-'}</p>
                            </div>
                            <button
                                onClick={() => setViewingTemplate(null)}
                                className="w-full py-3 rounded-xl border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 mt-2"
                            >
                                {t('modal.close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmationModal
                isOpen={confirmConfig.isOpen}
                onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
                onConfirm={confirmConfig.onConfirm}
                title={confirmConfig.title}
                message={confirmConfig.message}
            />
        </div>
    );
};

export default CompetencyTemplateManager;
