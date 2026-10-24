import { createContext, useContext, useState, type ReactNode } from 'react';

/** The program the creator picked on Overview, shared with the Students tab. Null means the newest. */
const Context = createContext<{ programId: string | null; setProgramId: (id: string | null) => void }>({
  programId: null,
  setProgramId: () => {},
});

export function SelectedProgramProvider({ children }: { children: ReactNode }) {
  const [programId, setProgramId] = useState<string | null>(null);
  return <Context.Provider value={{ programId, setProgramId }}>{children}</Context.Provider>;
}

export function useSelectedProgram() {
  return useContext(Context);
}
