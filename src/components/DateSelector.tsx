import React, { useEffect, useState } from 'react'
import type { Socket } from 'socket.io-client';
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
        // Keep current selected date (defaults to today). If today's date has no saved logs
        // we'll still keep it so the UI can show live data from the server API.
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

  // Ensure the select contains the currently selected date (e.g., today) even
  // if there are no saved logs yet so the UI can show live data.
  const selectedDateStr = formatDateForValue(selectedDate)
  const dateStrs = dates.map(d => formatDateForValue(d))
  const optionsDates = dateStrs.includes(selectedDateStr)
    ? dates
    : [selectedDate, ...dates]

  return (
    <div className="date-selector-container">
      <label htmlFor="date-select">Select Date:</label>
      <select
        ref={selectRef}
        id="date-select"
        value={selectedDateStr}
        onChange={handleDateChange}
        className="date-dropdown"
      >
        {optionsDates.length === 0 ? (
          <option>No data available</option>
        ) : (
          optionsDates.map(date => (
            <option key={formatDateForValue(date)} value={formatDateForValue(date)}>
              {formatDateForDisplay(date)}{formatDateForValue(date) === formatDateForValue(new Date()) ? ' (Today - live)' : ''}
            </option>
          ))
        )}
      </select>
    </div>
  )
}
