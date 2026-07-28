import { cn } from '../../lib/utils'

export default function DataTable({ columns, data }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slatey-200 bg-white/80 dark:border-slatey-700 dark:bg-slatey-900/70">
      <table className="w-full text-left text-sm">
        <thead className="bg-slatey-50 text-xs uppercase tracking-[0.2em] text-slatey-400 dark:bg-slatey-800">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={cn('px-4 py-3 font-medium', column.className)}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => (
            <tr key={row.id || index} className="border-t border-slatey-100 dark:border-slatey-800">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 text-slatey-600 dark:text-slatey-200">
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
