export function ProfileAccordion({
  header,
  sections,
}: {
  header: React.ReactNode;
  sections: { id: string; content: React.ReactNode }[];
}) {
  return (
    <div className="space-y-4">
      {header}
      <div className="space-y-3">
        {sections.map((s) => (
          <div key={s.id}>{s.content}</div>
        ))}
      </div>
    </div>
  );
}
