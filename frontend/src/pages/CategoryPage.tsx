import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '../api/client';
import type { Category, PaginatedResponse } from '../types';
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext';
import { useLayout } from '../contexts/LayoutContext';
import { usePermissions } from '../hooks/usePermissions';
import Loading from '../components/common/Loading';
import ErrorMessage from '../components/common/ErrorMessage';
import Pagination from '../components/common/Pagination';
import { format } from 'date-fns';
import CreateCategoryModal from '../components/modals/categories/CreateCategoryModal';
import EditCategoryModal from '../components/modals/categories/EditCategoryModal';
import ConfirmDialog from '../components/common/ConfirmDialog';
import toast from 'react-hot-toast';

export default function CategoryPage() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { selectedPeriodId } = useBudgetPeriod();
  const { isCardsView } = useLayout();
  const { canManageBudgetData } = usePermissions();
  const queryClient = useQueryClient();

  useEffect(() => {
    setPage(1);
  }, [selectedPeriodId]);

  const { data: apiResponse, isLoading, error, refetch } = useQuery({
    queryKey: ['categories', selectedPeriodId, page, pageSize],
    queryFn: async () => {
      if (!selectedPeriodId) return null
      const response = await categoriesApi.getAll({ budget_period_id: selectedPeriodId, page, page_size: pageSize });
      return response.data as PaginatedResponse<Category>;
    },
    enabled: !!selectedPeriodId
  });

  const categories = apiResponse?.items || [];
  const totalItems = apiResponse?.total || 0;
  const totalPages = apiResponse?.total_pages || 0;

  const importMutation = useMutation({
    mutationFn: categoriesApi.import,
    onSuccess: () => {
      toast.success('Categories imported successfully!');
      queryClient.invalidateQueries({ queryKey: ['categories', selectedPeriodId] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to import categories.');
    },
  });

  const handleEditClick = (category: Category) => {
    setCategoryToEdit(category);
    setIsEditModalOpen(true);
  };

  const handleDeleteClick = (category: Category) => {
    setCategoryToDelete(category);
    setIsConfirmDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (categoryToDelete) {
      try {
        await categoriesApi.delete(categoryToDelete.id);
        toast.success('Category deleted successfully!');
        refetch();
      } catch {
        toast.error('Failed to delete category.');
      } finally {
        setIsConfirmDialogOpen(false);
        setCategoryToDelete(null);
      }
    }
  };

  const handleExport = async () => {
    if (!selectedPeriodId) return;

    try {
      const response = await categoriesApi.export({ budget_period_id: selectedPeriodId });
      const jsonData = JSON.stringify(response.data, null, 2);
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `categories_export_${selectedPeriodId}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Categories exported successfully!');
    } catch {
      toast.error('Failed to export categories');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && selectedPeriodId) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('budget_period_id', selectedPeriodId.toString());
      importMutation.mutate(formData);
    }
    // Reset file input
    if(event.target) {
      event.target.value = '';
    }
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
        <h1 className="font-headline font-extrabold tracking-tight text-3xl text-on-surface">Categories</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          {canManageBudgetData && (
            <>
              <button
                onClick={handleImportClick}
                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selectedPeriodId}
              >
                Import
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".json"
              />
            </>
          )}
          <button
            onClick={handleExport}
            className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg hover:bg-surface-container transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedPeriodId || totalItems === 0}
          >
            Export
          </button>
          {canManageBudgetData && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-gradient-to-br from-primary to-primary-dim text-on-primary rounded-lg hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={!selectedPeriodId}
            >
              Create New Category
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorMessage message="Failed to load categories." />
      ) : (
        <div className="bg-surface-container-lowest rounded-xl overflow-hidden max-w-4xl mx-auto" style={{ boxShadow: 'var(--shadow-card)' }}>
          {totalItems > 0 ? (
            <>
              <table className={isCardsView ? 'hidden' : 'hidden md:table w-full'}>
                <thead className="bg-surface-container-low">
                  <tr>
                    <th className="px-6 py-3 text-left font-mono text-[9px] uppercase tracking-widest text-outline">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left font-mono text-[9px] uppercase tracking-widest text-outline">
                      Created At
                    </th>
                    {canManageBudgetData && (
                      <th className="px-6 py-3 text-right font-mono text-[9px] uppercase tracking-widest text-outline">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {categories.map((category) => (
                    <tr key={category.id} className="hover:bg-surface-container-low transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-on-surface">
                        {category.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-on-surface-variant font-mono">
                        {format(new Date(category.created_at), 'PPP')}
                      </td>
                      {canManageBudgetData && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleEditClick(category)}
                            className="text-primary hover:text-primary-dim"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(category)}
                            className="text-negative hover:opacity-80 ml-4"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={isCardsView ? '' : 'md:hidden'}>
                {categories.map((category) => (
                  <div key={category.id} className="p-4 hover:bg-surface-container-low transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-on-surface">{category.name}</h4>
                        <p className="text-sm text-on-surface-variant mt-1 font-mono">
                          {format(new Date(category.created_at), 'PPP')}
                        </p>
                      </div>
                    </div>
                    {canManageBudgetData && (
                      <div className="flex space-x-2 mt-3">
                        <button
                          onClick={() => handleEditClick(category)}
                          className="flex-1 px-3 py-2 text-sm font-medium text-primary bg-primary-container rounded-lg hover:opacity-80"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(category)}
                          className="flex-1 px-3 py-2 text-sm font-medium text-white bg-negative rounded-lg hover:opacity-80"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {totalItems > 0 && (
                <Pagination
                  page={page}
                  total_pages={totalPages}
                  total={totalItems}
                  page_size={pageSize}
                  onPageChange={setPage}
                  onPageSizeChange={(size) => {
                    setPageSize(size);
                    setPage(1);
                  }}
                />
              )}
            </>
          ) : (
            <div className="p-6 text-center text-on-surface-variant">
              No categories found for this budget period.
            </div>
          )}
        </div>
      )}

      {selectedPeriodId && (
        <CreateCategoryModal
          isOpen={isCreateModalOpen}
          onClose={() => {
            setIsCreateModalOpen(false);
            refetch();
          }}
          periodId={selectedPeriodId}
        />
      )}

      {categoryToEdit && (
        <EditCategoryModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setCategoryToEdit(null);
            refetch();
          }}
          category={categoryToEdit}
        />
      )}

      <ConfirmDialog
        isOpen={isConfirmDialogOpen}
        onCancel={() => setIsConfirmDialogOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Category"
        message={`Are you sure you want to delete the category "${categoryToDelete?.name}"? This action cannot be undone.`}
      />
    </div>
  );
}