"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Plus, Calendar, Trash2, Filter, X, Download, Upload, Edit } from "lucide-react"
import { cn } from "@/lib/utils"
import { PWAInstall } from "@/components/pwa-install"

type Todo = {
  id: string
  text: string
  completed: boolean
  date: string
  category: string
  tags: string[]
  pinned: boolean
}

type ViewType = "Overview" | "Calendar"

const mockTodos: Todo[] = [
  {
    id: "1",
    text: "Team standup meeting",
    completed: false,
    date: "2024-01-15",
    category: "work",
    tags: ["meeting", "team"],
    pinned: false,
  },
  {
    id: "2",
    text: "Review project proposal",
    completed: true,
    date: "2024-01-15",
    category: "work",
    tags: ["review", "project"],
    pinned: false,
  },
  {
    id: "3",
    text: "Grocery shopping",
    completed: false,
    date: "2024-01-16",
    category: "personal",
    tags: ["shopping", "errands"],
    pinned: false,
  },
  {
    id: "4",
    text: "Gym workout",
    completed: false,
    date: "2024-01-16",
    category: "health",
    tags: ["fitness", "routine"],
    pinned: false,
  },
  {
    id: "5",
    text: "Call mom",
    completed: true,
    date: "2024-01-14",
    category: "personal",
    tags: ["family", "call"],
    pinned: false,
  },
]

// Helper functions for .ics import/export
const exportToICS = (todos: Todo[]) => {
  const formatDate = (dateString: string) => {
    // Create date at noon to avoid timezone issues
    const date = new Date(dateString + "T12:00:00")
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, "0")
    const day = String(date.getDate()).padStart(2, "0")
    return `${year}${month}${day}`
  }

  const formatDateTime = () => {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, "0")
    const day = String(now.getUTCDate()).padStart(2, "0")
    const hours = String(now.getUTCHours()).padStart(2, "0")
    const minutes = String(now.getUTCMinutes()).padStart(2, "0")
    const seconds = String(now.getUTCSeconds()).padStart(2, "0")
    return `${year}${month}${day}T${hours}${minutes}${seconds}Z`
  }

  const escapeText = (text: string) => {
    return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n")
  }

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//DWMYO//DWMYO//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]

  todos.forEach((todo) => {
    const uid = `todo-${todo.id}@dwmyo.app`
    const dtstart = formatDate(todo.date)
    const dtstamp = formatDateTime()
    const summary = escapeText(todo.text)
    const description = escapeText(
      `Category: ${todo.category}\\nTags: ${todo.tags.join(", ")}\\nCompleted: ${todo.completed ? "Yes" : "No"}`,
    )

    icsLines.push(
      "BEGIN:VEVENT",
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `CATEGORIES:${todo.category}`,
      `STATUS:${todo.completed ? "COMPLETED" : "CONFIRMED"}`,
      "END:VEVENT",
    )
  })

  icsLines.push("END:VCALENDAR")
  return icsLines.join("\r\n")
}

const parseICS = (icsContent: string): Partial<Todo>[] => {
  const lines = icsContent.split(/\r?\n/)
  const events: Partial<Todo>[] = []
  let currentEvent: Partial<Todo> | null = null

  for (const line of lines) {
    const trimmedLine = line.trim()

    if (trimmedLine === "BEGIN:VEVENT") {
      currentEvent = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        completed: false,
        category: "personal",
        tags: [],
        pinned: false,
      }
    } else if (trimmedLine === "END:VEVENT" && currentEvent) {
      if (currentEvent.text && currentEvent.date) {
        events.push(currentEvent)
      }
      currentEvent = null
    } else if (currentEvent && trimmedLine.includes(":")) {
      const [key, ...valueParts] = trimmedLine.split(":")
      const value = valueParts.join(":")

      if (key.startsWith("SUMMARY")) {
        currentEvent.text = value
      } else if (key.startsWith("DTSTART")) {
        // Handle both DATE and DATETIME formats
        const dateValue = value.replace(/T.*/, "")
        if (dateValue.match(/^\d{8}$/)) {
          // Format: YYYYMMDD
          const year = dateValue.substr(0, 4)
          const month = dateValue.substr(4, 2)
          const day = dateValue.substr(6, 2)
          currentEvent.date = `${year}-${month}-${day}`
        }
      } else if (key.startsWith("DESCRIPTION")) {
        // Parse description for category and tags
        const description = value.replace(/\\n/g, "\n")
        const categoryMatch = description.match(/Category:\s*([^\n]+)/)
        const tagsMatch = description.match(/Tags:\s*([^\n]+)/)
        const completedMatch = description.match(/Completed:\s*(Yes|No)/)

        if (categoryMatch) {
          currentEvent.category = categoryMatch[1].trim()
        }
        if (tagsMatch) {
          currentEvent.tags = tagsMatch[1]
            .split(",")
            .map((tag) => tag.trim())
            .filter((tag) => tag)
        }
        if (completedMatch) {
          currentEvent.completed = completedMatch[1] === "Yes"
        }
      } else if (key.startsWith("STATUS")) {
        currentEvent.completed = value === "COMPLETED"
      } else if (key.startsWith("CATEGORIES")) {
        currentEvent.category = value
      }
    }
  }

  return events
}

// Local storage helpers
const STORAGE_KEY = "dwmyo-todos"

const loadTodosFromStorage = (): Todo[] => {
  if (typeof window === "undefined") return mockTodos

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed : mockTodos
    }
  } catch (error) {
    console.error("Error loading todos from localStorage:", error)
  }

  return mockTodos
}

const saveTodosToStorage = (todos: Todo[]) => {
  if (typeof window === "undefined") return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  } catch (error) {
    console.error("Error saving todos to localStorage:", error)
  }
}

// Separate component for the add/edit form to prevent focus issues
function AddEventForm({
  onSubmit,
  onCancel,
  selectedDate,
  setSelectedDate,
  editingTodo,
}: {
  onSubmit: (text: string, tags: string[], pinTask: boolean, date: string, editingId?: string) => void
  onCancel: () => void
  selectedDate: string
  setSelectedDate: (date: string) => void
  editingTodo?: Todo | null
}) {
  const [text, setText] = useState(editingTodo?.text || "")
  const [tags, setTags] = useState(editingTodo?.tags.join(", ") || "")
  const [pinTask, setPinTask] = useState(editingTodo?.pinned || false)

  // Update form when editingTodo changes
  useEffect(() => {
    if (editingTodo) {
      setText(editingTodo.text)
      setTags(editingTodo.tags.join(", "))
      setPinTask(editingTodo.pinned)
      setSelectedDate(editingTodo.date)
    } else {
      setText("")
      setTags("")
      setPinTask(false)
    }
  }, [editingTodo, setSelectedDate])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim()) {
      const tagList = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
      onSubmit(text, tagList, pinTask, selectedDate, editingTodo?.id)
      setText("")
      setTags("")
      setPinTask(false)
    }
  }

  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-sm">{editingTodo ? "Edit Event" : "Add New Event"}</h3>
        <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 w-7 p-0">
          <X className="h-3 w-3" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Input
            placeholder="Add a new task..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1 text-sm h-9"
            autoFocus
          />
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full sm:w-36 text-sm h-9"
          />
          <Button type="submit" size="sm" className="h-9 px-3">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Input
            placeholder="Tags (comma separated)..."
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="flex-1 text-sm h-9"
          />
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              id="pin-task"
              checked={pinTask}
              onCheckedChange={(checked) => setPinTask(!!checked)}
              className="h-4 w-4"
            />
            <label htmlFor="pin-task" className="text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
              Pin
            </label>
          </div>
        </div>
      </form>
    </Card>
  )
}

export default function TodoCalendarApp() {
  const [currentView, setCurrentView] = useState<ViewType>("Overview")
  const [todos, setTodos] = useState<Todo[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])
  const [tagFilter, setTagFilter] = useState("")
  const [showMore365, setShowMore365] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const navRef = useRef<HTMLDivElement>(null)
  const [viewYear, setViewYear] = useState(new Date().getFullYear())
  const [viewMonth, setViewMonth] = useState(new Date().getMonth())

  const views: ViewType[] = ["Overview", "Calendar"]

  // Load todos from localStorage on mount
  useEffect(() => {
    setTodos(loadTodosFromStorage())
  }, [])

  // Save todos to localStorage whenever todos change
  useEffect(() => {
    if (todos.length > 0) {
      saveTodosToStorage(todos)
    }
  }, [todos])

  // Handle URL parameters for PWA shortcuts
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const viewParam = urlParams.get("view")
    if (viewParam && views.includes(viewParam as ViewType)) {
      setCurrentView(viewParam as ViewType)
    }
  }, [])

  // Scroll active nav item into view when it changes
  useEffect(() => {
    if (navRef.current) {
      const activeButton = navRef.current.querySelector('[data-state="active"]')
      if (activeButton) {
        const navRect = navRef.current.getBoundingClientRect()
        const buttonRect = activeButton.getBoundingClientRect()

        // Calculate if the button is outside the visible area
        if (buttonRect.left < navRect.left || buttonRect.right > navRect.right) {
          // Scroll the button into view with some padding
          const scrollPosition = buttonRect.left - navRect.left - 16
          navRef.current.scrollTo({
            left: scrollPosition,
            behavior: "smooth",
          })
        }
      }
    }
  }, [currentView])

  // Prevent zoom on double tap for PWA
  useEffect(() => {
    let lastTouchEnd = 0
    const preventZoom = (e: TouchEvent) => {
      const now = new Date().getTime()
      if (now - lastTouchEnd <= 300) {
        e.preventDefault()
      }
      lastTouchEnd = now
    }

    document.addEventListener("touchend", preventZoom, { passive: false })
    return () => document.removeEventListener("touchend", preventZoom)
  }, [])

  const addTodo = (text: string, tags: string[], pinTask: boolean, date: string, editingId?: string) => {
    if (text.trim()) {
      if (editingId) {
        // Edit existing todo
        setTodos(
          todos.map((todo) =>
            todo.id === editingId
              ? {
                  ...todo,
                  text: text,
                  date: date,
                  tags: tags,
                  pinned: pinTask,
                }
              : todo,
          ),
        )
        setEditingTodo(null)
      } else {
        // Add new todo
        const todo: Todo = {
          id: Date.now().toString(),
          text: text,
          completed: false,
          date: date,
          category: "personal",
          tags: tags,
          pinned: pinTask,
        }
        setTodos([...todos, todo])
      }
      setShowAddForm(false)
    }
  }

  const editTodo = (todo: Todo) => {
    setEditingTodo(todo)
    setShowAddForm(true)
  }

  const navigateToDate = (date: string) => {
    setSelectedDate(date)
    setCurrentView("Calendar")
  }

  const getCurrentViewDates = () => {
    switch (currentView) {
      default:
        return [selectedDate]
    }
  }

  const getFilteredTodos = (todoList: Todo[]) => {
    if (!tagFilter.trim()) return todoList
    return todoList.filter(
      (todo) =>
        todo.tags.some((tag) => tag.toLowerCase().includes(tagFilter.toLowerCase())) ||
        todo.text.toLowerCase().includes(tagFilter.toLowerCase()),
    )
  }

  const getAllTags = () => {
    const allTags = todos.flatMap((todo) => todo.tags)
    return [...new Set(allTags)].sort()
  }

  const toggleTodo = (id: string) => {
    setTodos(todos.map((todo) => (todo.id === id ? { ...todo, completed: !todo.completed } : todo)))
  }

  const deleteTodo = (id: string) => {
    setTodos(todos.filter((todo) => todo.id !== id))
  }

  const moveUncompletedToNextDay = (fromDate: string) => {
    const nextDay = new Date(fromDate)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDayString = nextDay.toISOString().split("T")[0]

    const uncompletedTodos = todos.filter((todo) => todo.date === fromDate && !todo.completed)

    if (uncompletedTodos.length === 0) return

    const updatedTodos = todos.map((todo) => {
      if (todo.date === fromDate && !todo.completed) {
        return { ...todo, date: nextDayString }
      }
      return todo
    })

    setTodos(updatedTodos)
  }

  const autoMoveUncompletedTasks = () => {
    const today = new Date().toISOString().split("T")[0]
    const lastCheckKey = "dwmyo-last-auto-move-check"
    const lastCheck = localStorage.getItem(lastCheckKey)

    // Only run once per day
    if (lastCheck === today) return

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayString = yesterday.toISOString().split("T")[0]

    // Find all uncompleted tasks from previous days (not today)
    const uncompletedFromPast = todos.filter((todo) => {
      const todoDate = new Date(todo.date)
      const todayDate = new Date(today)
      return !todo.completed && todoDate < todayDate
    })

    if (uncompletedFromPast.length > 0) {
      // Move all uncompleted tasks from past days to today
      const updatedTodos = todos.map((todo) => {
        const todoDate = new Date(todo.date)
        const todayDate = new Date(today)
        if (!todo.completed && todoDate < todayDate) {
          return { ...todo, date: today }
        }
        return todo
      })

      setTodos(updatedTodos)

      // Store that we've done the check for today
      localStorage.setItem(lastCheckKey, today)

      // Optional: Show notification (you could add a toast here)
      console.log(`Auto-moved ${uncompletedFromPast.length} uncompleted tasks to today`)
    } else {
      // Still mark that we've checked today even if no moves were needed
      localStorage.setItem(lastCheckKey, today)
    }
  }

  const getTodosForDate = (date: string) => {
    return todos.filter((todo) => todo.date === date)
  }

  const getCurrentWeekDates = () => {
    const today = new Date()
    const currentDay = today.getDay()
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - currentDay)

    const weekDates = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      weekDates.push(date.toISOString().split("T")[0])
    }
    return weekDates
  }

  const getCurrentMonthDates = () => {
    const selectedDateObj = new Date(selectedDate)
    const year = selectedDateObj.getFullYear()
    const month = selectedDateObj.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)

    const dates = []
    for (let i = 1; i <= lastDay.getDate(); i++) {
      const date = new Date(year, month, i)
      dates.push(date.toISOString().split("T")[0])
    }
    return dates
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    })
  }

  const FilterButton = () => (
    <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowFilter(!showFilter)}>
      <Filter className="h-3 w-3 mr-1" />
      Filter
    </Button>
  )

  const AddButton = () => (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-xs"
      onClick={() => {
        setEditingTodo(null)
        setShowAddForm(!showAddForm)
      }}
    >
      <Plus className="h-3 w-3 mr-1" />
      Add Event
    </Button>
  )

  const handleExport = () => {
    try {
      console.log("Starting export with", todos.length, "todos")
      const icsContent = exportToICS(todos)
      console.log("Generated ICS content:", icsContent.substring(0, 200) + "...")

      const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `dwmyo-export-${new Date().toISOString().split("T")[0]}.ics`
      link.style.display = "none"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      console.log("Export completed successfully")
    } catch (error) {
      console.error("Export failed:", error)
      alert("Export failed. Please check the console for details.")
    }
  }

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      try {
        const importedEvents = parseICS(content)
        const newTodos: Todo[] = importedEvents
          .filter((event): event is Todo =>
            Boolean(event.text && event.date && event.id && event.category !== undefined && event.tags),
          )
          .map((event) => ({
            ...event,
            category: event.category || "personal",
            tags: event.tags || [],
            pinned: false,
          }))

        setTodos((prevTodos) => [...prevTodos, ...newTodos])

        // Reset the input
        event.target.value = ""

        // Show success message (you could add a toast here)
        console.log(`Imported ${newTodos.length} events successfully`)
      } catch (error) {
        console.error("Error importing .ics file:", error)
        // You could add error handling/toast here
      }
    }
    reader.readAsText(file)
  }

  const renderCalendarView = () => {
    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonth = today.getMonth()

    const firstDayOfMonth = new Date(viewYear, viewMonth, 1)
    const lastDayOfMonth = new Date(viewYear, viewMonth + 1, 0)
    const firstDayOfWeek = firstDayOfMonth.getDay()

    const daysInMonth = lastDayOfMonth.getDate()
    const daysFromPrevMonth = firstDayOfWeek
    const totalCells = Math.ceil((daysInMonth + daysFromPrevMonth) / 7) * 7

    const calendarDays = []

    // Previous month days
    const prevMonth = new Date(viewYear, viewMonth - 1, 0)
    for (let i = daysFromPrevMonth - 1; i >= 0; i--) {
      const day = prevMonth.getDate() - i
      const year = viewMonth === 0 ? viewYear - 1 : viewYear
      const month = viewMonth === 0 ? 11 : viewMonth - 1
      const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      calendarDays.push({
        date: dateString,
        day,
        isCurrentMonth: false,
        isToday: false,
      })
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      const dateString = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      const isToday = dateString === today.toISOString().split("T")[0]
      calendarDays.push({
        date: dateString,
        day,
        isCurrentMonth: true,
        isToday,
      })
    }

    // Next month days
    const remainingCells = totalCells - calendarDays.length
    for (let day = 1; day <= remainingCells; day++) {
      const year = viewMonth === 11 ? viewYear + 1 : viewYear
      const month = viewMonth === 11 ? 0 : viewMonth + 1
      const dateString = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      calendarDays.push({
        date: dateString,
        day,
        isCurrentMonth: false,
        isToday: false,
      })
    }

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ]

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-light font-mono">
              {monthNames[viewMonth]} {viewYear}
            </h2>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 text-xs"
                onClick={() => {
                  if (viewMonth === 0) {
                    setViewMonth(11)
                    setViewYear(viewYear - 1)
                  } else {
                    setViewMonth(viewMonth - 1)
                  }
                }}
              >
                ←
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 w-7 p-0 text-xs"
                onClick={() => {
                  if (viewMonth === 11) {
                    setViewMonth(0)
                    setViewYear(viewYear + 1)
                  } else {
                    setViewMonth(viewMonth + 1)
                  }
                }}
              >
                →
              </Button>
            </div>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <FilterButton />
            <AddButton />
          </div>
        </div>

        {showAddForm && (
          <AddEventForm
            onSubmit={addTodo}
            onCancel={() => {
              setShowAddForm(false)
              setEditingTodo(null)
            }}
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            editingTodo={editingTodo}
          />
        )}

        {showFilter && (
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Filter className="h-3 w-3 text-muted-foreground" />
              <Input
                placeholder="Filter by tags or text"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="flex-1 font-mono text-sm h-8"
              />
            </div>
          </Card>
        )}

        <div className="grid grid-cols-7 gap-1">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="p-1 text-center text-xs font-medium text-muted-foreground font-mono">
              {day}
            </div>
          ))}
          {calendarDays.map((calendarDay, index) => {
            const dayTodos = getTodosForDate(calendarDay.date)

            return (
              <div
                key={index}
                className={cn(
                  "p-1 min-h-[70px] cursor-pointer transition-all duration-200 border rounded-md",
                  calendarDay.isCurrentMonth ? "bg-background" : "bg-muted/30",
                  calendarDay.isToday && "ring-2 ring-primary",
                  calendarDay.date === selectedDate && "bg-accent/50 ring-2 ring-accent shadow-md",
                  "hover:bg-accent/30",
                )}
                onClick={() => {
                  setSelectedDate(calendarDay.date)
                  // Scroll to the tasks section after a short delay to allow state update
                  setTimeout(() => {
                    document
                      .getElementById("selected-day-tasks")
                      ?.scrollIntoView({ behavior: "smooth", block: "start" })
                  }, 100)
                }}
              >
                <div
                  className={cn(
                    "text-xs font-medium mb-1 font-mono",
                    !calendarDay.isCurrentMonth && "text-muted-foreground",
                  )}
                >
                  {calendarDay.day}
                </div>
                <div className="space-y-1">
                  {dayTodos.slice(0, 2).map((todo) => (
                    <div
                      key={todo.id}
                      className={cn(
                        "w-full h-1 rounded-full",
                        todo.completed ? "bg-[hsl(var(--ds-red-700))]" : "bg-[hsl(var(--ds-red-700))]",
                      )}
                    />
                  ))}
                  {dayTodos.length > 2 && (
                    <div className="text-[10px] text-muted-foreground font-mono">+{dayTodos.length - 2}</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="mt-8 space-y-4" id="selected-day-tasks">
          <h3 className="text-xl font-medium">Tasks for {formatDate(selectedDate)}</h3>
          <div className="space-y-2">
            {getFilteredTodos(getTodosForDate(selectedDate)).map((todo) => (
              <div key={todo.id} className="flex flex-col sm:flex-row sm:items-center gap-2 py-1">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Checkbox checked={todo.completed} onCheckedChange={() => toggleTodo(todo.id)} className="h-4 w-4" />
                  <span
                    className={cn(
                      "flex-1 text-sm font-medium break-words",
                      todo.completed && "line-through text-muted-foreground",
                    )}
                  >
                    {todo.text}
                  </span>
                </div>
                <div className="flex items-center gap-1 flex-wrap sm:flex-nowrap">
                  {todo.tags.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {todo.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-[10px] font-mono px-1 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => editTodo(todo)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-primary"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTodo(todo.id)}
                      className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}

            {getFilteredTodos(getTodosForDate(selectedDate)).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-sm">No tasks for this day</p>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderOverviewView = () => {
    const today = new Date().toISOString().split("T")[0]
    const todayTodos = getFilteredTodos(getTodosForDate(today))

    // Get next 7 days todos
    const next7Days = []
    for (let i = 1; i <= 7; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)
      next7Days.push(date.toISOString().split("T")[0])
    }
    const next7DaysTodos = getFilteredTodos(todos.filter((todo) => next7Days.includes(todo.date)))

    // Get next 28 days todos (excluding first 7)
    const next28Days = []
    for (let i = 8; i <= 28; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)
      next28Days.push(date.toISOString().split("T")[0])
    }
    const next28DaysTodos = getFilteredTodos(todos.filter((todo) => next28Days.includes(todo.date)))

    // Get next 365 days todos (excluding first 28)
    const next365Days = []
    for (let i = 29; i <= 365; i++) {
      const date = new Date()
      date.setDate(date.getDate() + i)
      next365Days.push(date.toISOString().split("T")[0])
    }
    const next365DaysTodos = getFilteredTodos(todos.filter((todo) => next365Days.includes(todo.date) && todo.pinned))

    const formatEventDate = (dateString: string) => {
      const date = new Date(dateString)
      return date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    }

    const EventList = ({
      todos,
      showAll = false,
      onShowMore,
      showDates = true,
    }: { todos: Todo[]; showAll?: boolean; onShowMore?: () => void; showDates?: boolean }) => {
      const displayTodos = showAll ? todos : todos.slice(0, 5)

      if (todos.length === 0) {
        return <div className="text-xs text-muted-foreground italic py-3">No events to show</div>
      }

      return (
        <div className="space-y-2">
          {displayTodos.map((todo) => (
            <div key={todo.id} className="space-y-1">
              <div
                className="flex items-center gap-2 cursor-pointer p-1 transition-colors"
                onClick={() => navigateToDate(todo.date)}
              >
                <Checkbox checked={todo.completed} onCheckedChange={() => toggleTodo(todo.id)} className="h-3 w-3" />
                <span className={cn("text-sm font-medium", todo.completed && "line-through text-muted-foreground")}>
                  {todo.text}
                </span>
              </div>
              {showDates && (
                <div className="text-[10px] text-muted-foreground ml-6 font-mono">{formatEventDate(todo.date)}</div>
              )}
            </div>
          ))}

          {!showAll && todos.length > 5 && onShowMore && (
            <button onClick={onShowMore} className="text-xs text-primary hover:underline flex items-center gap-1 ml-6">
              <span>Show more</span>
            </button>
          )}
        </div>
      )
    }

    const Section = ({
      title,
      todos,
      showAll = false,
      onShowMore,
    }: {
      title: string
      todos: Todo[]
      showAll?: boolean
      onShowMore?: () => void
    }) => {
      const count = todos.length

      return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-medium text-foreground">{title}</h3>
            <span className="text-xl font-light text-red-500 font-mono">{count}</span>
          </div>
          <EventList todos={todos} showAll={showAll} onShowMore={onShowMore} showDates={false} />
        </div>
      )
    }

    return (
      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <h2 className="text-2xl font-light font-mono">Overview</h2>
            <div className="flex gap-2 w-full sm:w-auto">
              <FilterButton />
              <AddButton />
            </div>
          </div>

          {showAddForm && (
            <AddEventForm
              onSubmit={addTodo}
              onCancel={() => {
                setShowAddForm(false)
                setEditingTodo(null)
              }}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              editingTodo={editingTodo}
            />
          )}

          {showFilter && (
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Filter className="h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Filter by tags or text"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="flex-1 font-mono text-sm h-8"
                />
              </div>
            </Card>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <Section title="Today" todos={todayTodos} showAll />
          <Section title="Next 7 Days" todos={next7DaysTodos} showAll />
          <Section title="Next 28 Days" todos={next28DaysTodos} showAll />
          <Section
            title="Next 365 Days"
            todos={next365DaysTodos}
            showAll={showMore365}
            onShowMore={() => setShowMore365(true)}
          />
        </div>
      </div>
    )
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case "Overview":
        return renderOverviewView()
      case "Calendar":
        return renderCalendarView()
      default:
        return renderOverviewView()
    }
  }

  // Auto-move uncompleted tasks from previous days
  useEffect(() => {
    if (todos.length > 0) {
      autoMoveUncompletedTasks()
    }
  }, [todos.length]) // Only run when todos are first loaded

  // Check for auto-move on focus/visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && todos.length > 0) {
        autoMoveUncompletedTasks()
      }
    }

    const handleFocus = () => {
      if (todos.length > 0) {
        autoMoveUncompletedTasks()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("focus", handleFocus)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("focus", handleFocus)
    }
  }, [todos])

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                onClick={() => {
                  const today = new Date()
                  setSelectedDate(today.toISOString().split("T")[0])
                  setViewYear(today.getFullYear())
                  setViewMonth(today.getMonth())
                  setCurrentView("Calendar")
                }}
                className="cursor-pointer hover:bg-accent/50 transition-colors p-2 rounded-md"
              >
                <Calendar className="h-7 w-7" />
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-hide" ref={navRef}>
              <nav className="flex items-center gap-1 px-2 min-w-max">
                {views.map((view) => (
                  <Button
                    key={view}
                    variant={currentView === view ? "default" : "ghost"}
                    size="sm"
                    onClick={() => setCurrentView(view)}
                    className="font-medium whitespace-nowrap"
                    data-state={currentView === view ? "active" : "inactive"}
                  >
                    {view}
                  </Button>
                ))}
              </nav>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6">{renderCurrentView()}</main>

      {/* Import/Export buttons at bottom */}
      <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" className="h-8 text-xs">
              <Download className="h-3 w-3 mr-1" />
              Export .ics
            </Button>
            <div className="relative">
              <input
                type="file"
                accept=".ics"
                onChange={handleImport}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                id="ics-import"
              />
              <Button variant="outline" size="sm" asChild className="h-8 text-xs">
                <label htmlFor="ics-import" className="cursor-pointer flex items-center justify-center">
                  <Upload className="h-3 w-3 mr-1" />
                  Import .ics
                </label>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <PWAInstall />
    </div>
  )
}
