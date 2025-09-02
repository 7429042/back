export type ProgramResponseDto = {
  _id: string;
  title?: string;
  categoryType?: 'dpo' | 'prof_training';
  dpoSubcategory?: 'pk' | 'pp';
  description?: string;
  category?: string;
  views: number;
  hours?: number;
  completionDocument?: string;
  slug?: string;
  status: 'draft' | 'published';
  createdAt?: Date;
  updatedAt?: Date;
};
