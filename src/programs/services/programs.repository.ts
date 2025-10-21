import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Program, ProgramDocument } from '../schemas/programSchema';
import {
  FilterQuery,
  Model,
  ProjectionType,
  QueryOptions,
  Types,
  UpdateQuery,
} from 'mongoose';

@Injectable()
export class ProgramsRepository {
  constructor(
    @InjectModel(Program.name)
    private readonly programModel: Model<ProgramDocument>,
  ) {}

  createDraft(categoryId: Types.ObjectId) {
    return this.programModel.create({ status: 'draft', category: categoryId });
  }

  find<T = Program>(
    filter: FilterQuery<Program>,
    projection?: ProjectionType<Program>,
    options?: QueryOptions<Program>,
  ) {
    return this.programModel.find<T>(filter, projection, options);
  }

  findLean<T = Program>(
    filter: FilterQuery<Program>,
    projection?: ProjectionType<Program>,
    options?: QueryOptions<Program>,
  ) {
    return this.programModel.find<T>(filter, projection, options).lean<T>();
  }

  findByIdLean<T = Program>(_id: string, projection?: ProjectionType<Program>) {
    return this.programModel.findById<T>(_id, projection).lean<T>();
  }

  findOneLean<T = Program>(
    filter: FilterQuery<Program>,
    projection?: ProjectionType<Program>,
    options?: QueryOptions<Program>,
  ) {
    return this.programModel.findOne<T>(filter, projection, options).lean<T>();
  }

  count(filter: FilterQuery<Program>) {
    return this.programModel.countDocuments(filter);
  }

  exists(filter: FilterQuery<Program>) {
    return this.programModel.exists(filter);
  }

  findById(id: string) {
    return this.programModel.findById(id);
  }

  findByIdAndUpdate(
    id: string,
    update: UpdateQuery<Program> | Program,
    options?: QueryOptions<Program>,
  ) {
    return this.programModel.findByIdAndUpdate(id, update, options);
  }

  findOneAndUpdate(
    filter: FilterQuery<Program>,
    update: UpdateQuery<Program> | Program,
    options?: QueryOptions<Program>,
  ) {
    return this.programModel.findOneAndUpdate(filter, update, options);
  }

  findByIdAndDelete(id: string) {
    return this.programModel.findByIdAndDelete(id);
  }
}
