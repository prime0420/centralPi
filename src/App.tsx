import React, { useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import FactoryOverview from './components/FactoryOverview'
import ShiftView from './components/ShiftView'
import TimelineView from './components/TimelineView'
import { DateProvider } from './context/DateContext'
import { MachineProvider } from './context/MachineContext'

type View = 'factory' | 'shift' | 'timeline'

function App() {
  const [view, setView] = useState<View>('factory')

  return (
    <DateProvider>
      <MachineProvider>
        <div className="app-root">
          <Sidebar onNavigate={setView} />
          <main className="main-area">
            {view === 'factory' && <FactoryOverview onMachineSelect={() => setView('shift')} />}
            {view === 'shift' && <ShiftView />}
            {view === 'timeline' && <TimelineView onMachineSelect={() => setView('shift')} />}
          </main>
        </div>
      </MachineProvider>
    </DateProvider>
  )
}

export default App
