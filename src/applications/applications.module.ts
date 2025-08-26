import { Module } from '@nestjs/common';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Application, ApplicationSchema } from './schemas/application.schema';
import { Program, ProgramSchema } from '../programs/schemas/programSchema';
import { AuthModule } from '../auth/auth.module';

@Module({
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  imports: [
    AuthModule,
    MongooseModule.forFeature([
      {
        name: Application.name,
        schema: ApplicationSchema,
      },
      {
        name: Program.name,
        schema: ProgramSchema,
      },
    ]),
  ],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
