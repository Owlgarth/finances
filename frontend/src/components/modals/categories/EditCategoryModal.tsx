import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { categoriesApi, budgetPeriodsApi } from '../../../api/client';
import type { Category, BudgetPeriod } from '../../../types';
import Loading from '../../common/Loading';
import ErrorMessage from '../../common/ErrorMessage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  category: Category;
}

export default function EditCategoryModal({ isOpen, onClose, category }: Props) {
  const [name, setName] = useState(category.name);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number>(category.budget_period_id);
  const queryClient = useQueryClient();

  const { data: budgetPeriods, isLoading: isLoadingPeriods, error: periodsError } = useQuery<BudgetPeriod[]>({
    queryKey: ['budgetPeriods'],
    queryFn: async () => {
      const response = await budgetPeriodsApi.getAll();
      return response.data;
    },
  });

  useEffect(() => {
    if (category) {
      setName(category.name);
      setSelectedPeriodId(category.budget_period_id);
    }
  }, [category]);

  const updateMutation = useMutation({
    mutationFn: (data: { id: number; name: string; budget_period_id: number }) =>
      categoriesApi.update(data.id, { name: data.name, budget_period_id: data.budget_period_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', category.budget_period_id] });
      queryClient.invalidateQueries({ queryKey: ['categories', selectedPeriodId] });
      toast.success('Category updated successfully!');
      onClose();
    },
    onError: (error: any) => {
      // Don't show error for offline mode - the interceptor already shows a success toast
      // and performs the optimistic update
      if (error?.name === 'OfflineError') {
        onClose();
        return;
      }
      toast.error('Failed to update category.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Category name cannot be empty.');
      return;
    }
    if (!selectedPeriodId) {
      toast.error('Please select a budget period.');
      return;
    }
    updateMutation.mutate({ id: category.id, name, budget_period_id: selectedPeriodId });
  };

  if (!isOpen) return null;

  if (isLoadingPeriods) return <Loading />;
  if (periodsError) return <ErrorMessage message="Failed to load budget periods." />;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg p-4 sm:p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">Edit Category</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="categoryName" className="block text-sm font-medium mb-1">Category Name</label>
            <input
              type="text"
              id="categoryName"
              className="w-full border rounded px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="mb-4">
            <label htmlFor="budgetPeriod" className="block text-sm font-medium mb-1">Budget Period</label>
            <select
              id="budgetPeriod"
              className="w-full border rounded px-3 py-2"
              value={selectedPeriodId}
              onChange={(e) => setSelectedPeriodId(Number(e.target.value))}
              required
            >
              {budgetPeriods?.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? 'Updating...' : 'Update Category'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
