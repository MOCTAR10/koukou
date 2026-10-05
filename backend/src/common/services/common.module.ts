import { Module } from '@nestjs/common';
import { PdfService } from './pdf.service.js';
import { CsvService } from './csv.service.js';

@Module({
  providers: [PdfService, CsvService],
  exports: [PdfService, CsvService],
})
export class CommonModule {}
