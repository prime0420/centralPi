import React, { useState } from 'react'
import './App.css'
import Sidebar from './components/Sidebar'
import FactoryOverview from './components/FactoryOverview'
import ShiftView from './components/ShiftView'
import TimelineView from './components/TimelineView'

type View = 'factory' | 'shift' | 'timeline'

function App() {
  const [view, setView] = useState<View>('factory')

  return (
    <div className="app-root">
      <Sidebar onNavigate={setView} />
      <main className="main-area">
        {view === 'factory' && <FactoryOverview />}
        {view === 'shift' && <ShiftView />}
        {view === 'timeline' && <TimelineView />}
      </main>
    </div>
  )
}

export default App
