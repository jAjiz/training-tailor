/** The program's name, under the navy bar that holds its tabs. */
export function ProgramHeader({ name }: { name: string }) {
  return <h1 className="text-3xl">{name}</h1>;
}
