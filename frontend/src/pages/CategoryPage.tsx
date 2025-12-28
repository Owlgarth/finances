import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '../api/client';
import type { Category } from '../types';
import { useBudgetPeriod } from '../contexts/BudgetPeriodContext';
import { useLayout } from '../contexts/LayoutContext';
import { usePermissions } from '../hooks/usePermissions';
import Loading from '../components/common/Loading';
import ErrorMessage from '../components/common/ErrorMessage';
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { selectedPeriodId } = useBudgetPeriod();
  const { isCardsView } = useLayout();
  const { canManageBudgetData } = usePermissions();
  const queryClient = useQueryClient();

  const { data: categories, isLoading, error, refetch } = useQuery<Category[]>({
    queryKey: ['categories', selectedPeriodId],
    queryFn: async () => {
      if (!selectedPeriodId) return []
      const response = await categoriesApi.getAll({ budget_period_id: selectedPeriodId });
      return response.data as Category[];
    },
    enabled: !!selectedPeriodId
  });

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
        <h1 className="text-3xl font-bold text-gray-900">Categories</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          {canManageBudgetData && (
            <>
              <button
                onClick={handleImportClick}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedPeriodId || !categories || categories.length === 0}
          >
            Export
          </button>
          {canManageBudgetData && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="bg-white shadow-md rounded-lg overflow-hidden max-w-4xl mx-auto">
          {categories && categories.length > 0 ? (
            <>
              {/* Desktop Table */}
              <table className={isCardsView ? 'hidden' : 'hidden md:table w-full divide-y divide-gray-200'}>
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created At
                    </th>
                    {canManageBudgetData && (
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {categories.map((category) => (
                    <tr key={category.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {category.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {format(new Date(category.created_at), 'PPP')}
                      </td>
                      {canManageBudgetData && (
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => handleEditClick(category)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDeleteClick(category)}
                            className="text-red-600 hover:text-red-900 ml-4"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Mobile Cards */}
              <div className={isCardsView ? 'divide-y divide-gray-200' : 'md:hidden divide-y divide-gray-200'}>
                {categories.map((category) => (
                  <div key={category.id} className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold text-gray-900">{category.name}</h4>
                        <p className="text-sm text-gray-500 mt-1">
                          {format(new Date(category.created_at), 'PPP')}
                        </p>
                      </div>
                    </div>
                    {canManageBudgetData && (
                      <div className="flex space-x-2 mt-3">
                        <button
                          onClick={() => handleEditClick(category)}
                          className="flex-1 px-3 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteClick(category)}
                          className="flex-1 px-3 py-2 text-sm font-medium text-red-600 bg-red-50 rounded hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="p-6 text-center text-gray-500">
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