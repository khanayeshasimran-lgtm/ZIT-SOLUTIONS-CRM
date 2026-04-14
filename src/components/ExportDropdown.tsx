import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';

type ExportType = 'csv' | 'excel' | 'pdf';

interface ExportDropdownProps {
  onExport: (type: ExportType) => void | Promise<void>;
  disabled?: boolean;
}

export function ExportDropdown({
  onExport,
  disabled = false,
}: ExportDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="flex items-center gap-2"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="min-w-[160px]"
      >
        <DropdownMenuItem
          onClick={() => onExport('csv')}
          disabled={disabled}
          className="flex items-center gap-2 cursor-pointer"
        >
          <FileText className="h-4 w-4 text-muted-foreground" />
          Export as CSV
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onExport('excel')}
          disabled={disabled}
          className="flex items-center gap-2 cursor-pointer"
        >
          <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          Export as Excel
        </DropdownMenuItem>

        <DropdownMenuItem
          onClick={() => onExport('pdf')}
          disabled={disabled}
          className="flex items-center gap-2 cursor-pointer"
        >
          <FileText className="h-4 w-4 text-muted-foreground" />
          Export as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}