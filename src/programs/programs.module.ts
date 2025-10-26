import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Program, ProgramSchema } from './schemas/programSchema';
import { CategoriesModule } from '../categories/categories.module';
import { ProgramsRepository } from './services/programs.repository';
import { ProgramsCacheService } from './services/programs.cache';
import { ProgramsReadService } from './services/programs.read.service';
import { ProgramsWriteService } from './services/programs.write.service';
import { ProgramsSuggestService } from './services/programs.suggest.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: Program.name,
        schema: ProgramSchema,
      },
    ]),
    CategoriesModule,
  ],
  controllers: [ProgramsController],
  providers: [
    ProgramsRepository,
    ProgramsCacheService,
    ProgramsReadService,
    ProgramsWriteService,
    ProgramsSuggestService,
    ProgramsService,
  ],
  exports: [
    ProgramsReadService,
    ProgramsWriteService,
    ProgramsSuggestService,
    ProgramsService,
  ],
})
export class ProgramsModule {}
