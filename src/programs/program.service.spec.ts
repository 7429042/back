import { Program } from './schemas/programSchema';
import { Types } from 'mongoose';
import { ProgramsService } from './programs.service';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';

type PartialProgramDoc = Partial<Program> & {
  _id: Types.ObjectId;
  save?: jest.Mock<any, any>;
};

describe('ProgramService.publish', () => {
  let service: ProgramsService;
  const modelMock = {
    findById: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgramsService,
        {
          provide: getModelToken('Program'),
          useValue: modelMock,
        },
      ],
    }).compile();
    service = module.get(ProgramsService);
  });

  it('should publish draft successfully', async () => {
    const id = new Types.ObjectId().toString();
    const doc: PartialProgramDoc = {
      _id: new Types.ObjectId(id),
      status: 'draft',
      title: 'Title',
      category: new Types.ObjectId(),
      hours: 48,
      categoryType: 'prof_training',
      save: jest.fn().mockResolvedValue(undefined),
    };
    modelMock.findById.mockReturnValue({ exec: () => Promise.resolve(doc) });

    const res = await service.publish(id);

    expect(res).toBe(doc);
    expect(doc.status).toBe('published');
    expect(doc.save).toHaveBeenCalledTimes(1);
  });

  it('should throw 400 if already published', async () => {
    const id = new Types.ObjectId().toString();
    const doc: PartialProgramDoc = {
      _id: new Types.ObjectId(id),
      status: 'published',
      title: 'Title',
      category: new Types.ObjectId(),
      hours: 16,
      categoryType: 'prof_training',
      save: jest.fn(),
    };
    modelMock.findById.mockReturnValue({ exec: () => Promise.resolve(doc) });
    await expect(service.publish(id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should throw 400 if required fields are missing', async () => {
    const id = new Types.ObjectId().toString();
    const doc: PartialProgramDoc = {
      _id: new Types.ObjectId(id),
      status: 'draft',
      title: ' ',
      hours: 0,
      save: jest.fn(),
    };
    modelMock.findById.mockReturnValue({ exec: () => Promise.resolve(doc) });
    await expect(service.publish(id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('should throw 400 for invalid ObjectId', async () => {
    await expect(service.publish('not-an-objectid')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('should throw 400 when document not found', async () => {
    const id = new Types.ObjectId().toString();
    modelMock.findById.mockReturnValue({ exec: () => Promise.resolve(null) });
    await expect(service.publish(id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
