import React, { useEffect, useState } from 'react'
import { useSelectedDate } from '../context/DateContext'
import { fetchLogs, getAvailableDates } from '../services/api'
import './DateSelector.css'

export default function DateSelector() {
  const { selectedDate, setSelectedDate } = useSelectedDate()
  const [dates, setDates] = useState<Date[]>([])
  const [loading, setLoading] = useState(true)
  const selectRef = React.useRef<HTMLSelectElement>(null)

  // Fetch available dates from database
  useEffect(() => {
    const loadDates = async () => {
      setLoading(true)
      try {
        const logs = await fetchLogs()
        console.log("**log0:", logs.length, logs[0])
        const availableDates = getAvailableDates(logs)
        setDates(availableDates)
        console.log("Available dates:", availableDates)
        // Set selected date to first available date if current selection is not in available dates
        if (availableDates.length > 0) {
          const isCurrentDateAvailable = availableDates.some(d => 
            d.toISOString().split('T')[0] === selectedDate.toISOString().split('T')[0]
          )
          if (!isCurrentDateAvailable) {
            setSelectedDate(new Date(availableDates[0]))
          }
        }
      } catch (error) {
        console.error('Failed to load available dates:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadDates()
  }, [])

  const handleDateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value
    const date = dates.find(d => d.toISOString().split('T')[0] === selectedValue)
    if (date) {
      setSelectedDate(new Date(date))
      // Blur the select element to remove focus state
      if (selectRef.current) {
        selectRef.current.blur()
      }
    }
  }

  const formatDateForDisplay = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }
    return date.toLocaleDateString('en-US', options)
  }

  const formatDateForValue = (date: Date) => {
    return date.toISOString().split('T')[0]
  }

  if (loading) {
    return <div className="date-selector-container"><span>Loading dates...</span></div>
  }

  return (
    <div className="date-selector-container">
      <label htmlFor="date-select">Select Date:</label>
      <select
        ref={selectRef}
        id="date-select"
        value={formatDateForValue(selectedDate)}
        onChange={handleDateChange}
        className="date-dropdown"
      >
        {dates.length === 0 ? (
          <option>No data available</option>
        ) : (
          dates.map(date => (
            <option key={formatDateForValue(date)} value={formatDateForValue(date)}>
              {formatDateForDisplay(date)}
            </option>
          ))
        )}
      </select>
    </div>
  )
}
