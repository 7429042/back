import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Program, ProgramSchema } from './schemas/programSchema';
import { CategoriesModule } from '../categories/categories.module';

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
  providers: [ProgramsService],
  exports: [ProgramsService],
})
export class ProgramsModule {}
