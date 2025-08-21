import { Module } from '@nestjs/common';
import { ProgramsService } from './programs.service';
import { ProgramsController } from './programs.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Program, ProgramSchema } from './schemas/programSchema';

@Module({
  imports: [
    MongooseModule.forFeature([{
      name: Program.name,
      schema: ProgramSchema,
    }]),
  ],
  controllers: [ProgramsController],
  providers: [ProgramsService],
})
export class ProgramsModule {
}
