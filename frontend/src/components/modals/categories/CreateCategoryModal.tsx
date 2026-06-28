import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { categoriesApi } from '../../../api/client';
import Modal from '../../common/Modal';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  periodId: number;
}

export default function CreateCategoryModal({ isOpen, onClose, periodId }: Props) {
  const [name, setName] = useState('');
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: { budget_period_id: number; name: string }) => categoriesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['categories', periodId] });
      toast.success('Category created successfully!');
      onClose();
      setName('');
    },
    onError: (error: any) => {
      if (error?.name === 'OfflineError') {
        onClose();
        setName('');
        return;
      }
      toast.error('Failed to create category.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Category name cannot be empty.');
      return;
    }
    createMutation.mutate({ budget_period_id: periodId, name });
  };

  if (!isOpen) return null;

  return (
    <Modal open={isOpen} onClose={onClose} size="md" className="p-6">
        <h2 className="text-sm font-medium text-text mb-6">Create New Category</h2>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="categoryName" className="block font-mono text-[9px] uppercase tracking-widest text-text-muted mb-1">Category Name</label>
            <input
              type="text"
              id="categoryName"
              className="w-full bg-background border border-border rounded-none px-3 py-2 font-mono text-sm text-text focus:ring-2 focus:ring-border-focus focus:outline-none transition-colors"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Groceries"
              required
            />
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
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? 'Creating...' : 'Create Category'}
            </button>
          </div>
        </form>
    </Modal>
  );
}
