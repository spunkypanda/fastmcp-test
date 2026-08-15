import { Table } from "@chakra-ui/react";

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Renders an array of flat records (e.g. get_customers output) as a table.
 * Columns come from the union of record keys, in first-seen order.
 */
export function DataTable({ records }: { records: Record<string, unknown>[] }) {
  const columns = [...new Set(records.flatMap((r) => Object.keys(r)))];
  return (
    <Table.ScrollArea maxH="400px" borderWidth="1px" borderRadius="md">
      <Table.Root size="sm" stickyHeader>
        <Table.Header>
          <Table.Row>
            {columns.map((c) => (
              <Table.ColumnHeader key={c}>{c}</Table.ColumnHeader>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {records.map((record, i) => (
            <Table.Row key={i}>
              {columns.map((c) => (
                <Table.Cell key={c}>{formatCell(record[c])}</Table.Cell>
              ))}
            </Table.Row>
          ))}
        </Table.Body>
      </Table.Root>
    </Table.ScrollArea>
  );
}
