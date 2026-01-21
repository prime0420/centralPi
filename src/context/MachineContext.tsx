import React, { createContext, useContext, useState } from 'react'

interface MachineContextType {
  selectedMachine: string | null
  setSelectedMachine: (machine: string | null) => void
}

const MachineContext = createContext<MachineContextType | undefined>(undefined)

export function MachineProvider({ children }: { children: React.ReactNode }) {
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null)

  return (
    <MachineContext.Provider value={{ selectedMachine, setSelectedMachine }}>
      {children}
    </MachineContext.Provider>
  )
}

export function useSelectedMachine() {
  const context = useContext(MachineContext)
  if (!context) {
    throw new Error('useSelectedMachine must be used within MachineProvider')
  }
  return context
}
