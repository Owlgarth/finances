import { useState, useEffect } from 'react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { X } from 'lucide-react';
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
    enabled: isOpen,
  });

  useEffect(() => {
    if (category) {
      setName(category.name);
      setSelectedPeriodId(category.budget_period_id);
    }
  }, [category, isOpen]);

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

  return (
    <div className="fixed inset-0 bg-[rgba(47,51,51,0.5)] flex items-center justify-center z-50 p-4 backdrop-blur-[1px]">
      <div 
        className="bg-surface rounded-sm border border-border p-6 w-full max-w-md relative"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-primary transition-colors flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={14} />
        </button>

        <h2 className="text-sm font-medium text-text mb-6">Edit Category</h2>

        {isLoadingPeriods ? (
          <div className="py-12"><Loading /></div>
        ) : periodsError ? (
          <ErrorMessage message="Failed to load budget periods." />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label htmlFor="categoryName" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Category Name</label>
              <input
                type="text"
                id="categoryName"
                className="w-full bg-background border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="mb-6">
              <label htmlFor="budgetPeriod" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Budget Period</label>
              <select
                id="budgetPeriod"
                className="w-full bg-background border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
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

            <div className="flex justify-end space-x-3 mt-8">
              <button
                type="button"
                onClick={onClose}
                className="bg-surface border border-border text-text px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-primary text-white px-3 py-1.5 rounded-sm text-xs font-medium hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Updating...' : 'Update Category'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
