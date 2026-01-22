import React, { createContext, useContext, useState } from 'react'

interface MachineContextType {
  selectedMachine: string | null
  setSelectedMachine: (machine: string | null) => void
}

const MachineContext = createContext<MachineContextType | undefined>(undefined)

export function MachineProvider({ children }: { children: React.ReactNode }) {
  // initialize from localStorage so last-selected machine persists between page loads
  const [selectedMachine, setSelectedMachineState] = useState<string | null>(() => {
    try {
      const v = localStorage.getItem('selectedMachine')
      return v ? v : null
    } catch (e) {
      return null
    }
  })

  const setSelectedMachine = (machine: string | null) => {
    try {
      if (machine === null) localStorage.removeItem('selectedMachine')
      else localStorage.setItem('selectedMachine', machine)
    } catch (e) {
      // ignore storage errors
    }
    setSelectedMachineState(machine)
  }

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
