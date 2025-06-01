"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Plus, Calendar, Trash2, Filter, X, Download, Upload } from "lucide-react"
import { cn } from "@/lib/utils"
import { PWAInstall } from "@/components/pwa-install"

type Todo = {
  id: string
  text: string
  completed: boolean
  date: string
  category: string
  tags: string[]
}

type ViewType = "Days" | "Week" | "Month" | "Year" | "Overview"

const mockTodos: Todo[] = [
  {
    id: "1",
    text: "Team standup meeting",
    completed: false,
    date: "2024-01-15",
    category: "work",
    tags: ["meeting", "team"],
  },
  {
    id: "2",
    text: "Review project proposal",
    completed: true,
    date: "2024-01-15",
    category: "work",
    tags: ["review", "project"],
  },
  {
    id: "3",
    text: "Grocery shopping",
    completed: false,
    date: "2024-01-16",
    category: "personal",
    tags: ["shopping", "errands"],
  },
  {
    id: "4",
    text: "Gym workout",
    completed: false,
    date: "2024-01-16",
    category: "health",
    tags: ["fitness", "routine"],
  },
  { id: "5", text: "Call mom", completed: true, date: "2024-01-14", category: "personal", tags: ["family", "call"] },
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

// Separate component for the add form to prevent focus issues
function AddEventForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string, tags: string[], addToAllPages: boolean) => void
  onCancel: () => void
}) {
  const [text, setText] = useState("")
  const [tags, setTags] = useState("")
  const [addToAllPages, setAddToAllPages] = useState(false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (text.trim()) {
      const tagList = tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
      onSubmit(text, tagList, addToAllPages)
      setText("")
      setTags("")
      setAddToAllPages(false)
    }
  }

  return (
    <Card className="p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium">Add New Event</h3>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Add a new task..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="flex-1"
            autoFocus
          />
          <Button type="submit" size="sm">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Tags (comma separated)..."
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="flex-1"
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="add-to-all"
              checked={addToAllPages}
              onCheckedChange={(checked) => setAddToAllPages(!!checked)}
            />
            <label htmlFor="add-to-all" className="text-sm text-muted-foreground cursor-pointer">
              Add to all days
            </label>
          </div>
        </div>
      </form>
    </Card>
  )
}

export default function TodoCalendarApp() {
  const [currentView, setCurrentView] = useState<ViewType>("Days")
  const [todos, setTodos] = useState<Todo[]>([])
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0])
  const [tagFilter, setTagFilter] = useState("")
  const [showMore365, setShowMore365] = useState(false)
  const [showFilter, setShowFilter] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  const views: ViewType[] = ["Days", "Week", "Month", "Year", "Overview"]

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

  const addTodo = (text: string, tags: string[], addToAllPages: boolean) => {
    if (text.trim()) {
      if (addToAllPages) {
        // Add to multiple dates based on current view
        const datesToAdd = getCurrentViewDates()
        const newTodos = datesToAdd.map((date) => ({
          id: `${Date.now()}-${date}`,
          text: text,
          completed: false,
          date: date,
          category: "personal",
          tags: tags,
        }))
        setTodos([...todos, ...newTodos])
      } else {
        const todo: Todo = {
          id: Date.now().toString(),
          text: text,
          completed: false,
          date: selectedDate,
          category: "personal",
          tags: tags,
        }
        setTodos([...todos, todo])
      }
      setShowAddForm(false)
    }
  }

  const navigateToDate = (date: string) => {
    setSelectedDate(date)
    setCurrentView("Days")
  }

  const getCurrentViewDates = () => {
    switch (currentView) {
      case "Week":
        return getCurrentWeekDates()
      case "Month":
        return getCurrentMonthDates()
      case "Days":
        return [selectedDate]
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
    <Button variant="outline" size="sm" onClick={() => setShowFilter(!showFilter)}>
      <Filter className="h-4 w-4 mr-2" />
      Filter
    </Button>
  )

  const AddButton = () => (
    <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
      <Plus className="h-4 w-4 mr-2" />
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

  const renderDaysView = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-light font-mono">{formatDate(selectedDate)}</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <FilterButton />
          <AddButton />
        </div>
      </div>

      {showAddForm && <AddEventForm onSubmit={addTodo} onCancel={() => setShowAddForm(false)} />}

      {showFilter && (
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by tags or text..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="flex-1 font-mono"
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {getFilteredTodos(getTodosForDate(selectedDate)).map((todo) => (
          <div key={todo.id} className="flex items-center gap-3 py-2">
            <Checkbox checked={todo.completed} onCheckedChange={() => toggleTodo(todo.id)} />
            <span
              className={cn("flex-1 text-base font-medium", todo.completed && "line-through text-muted-foreground")}
            >
              {todo.text}
            </span>
            {todo.tags.length > 0 && (
              <div className="flex gap-1">
                {todo.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs font-mono">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteTodo(todo.id)}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
  )

  const renderWeekView = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-light">This Week</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <FilterButton />
          <AddButton />
        </div>
      </div>

      {showAddForm && <AddEventForm onSubmit={addTodo} onCancel={() => setShowAddForm(false)} />}

      {showFilter && (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by tags or text..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="flex-1 font-mono"
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {getCurrentWeekDates().map((date) => {
          const dayTodos = getTodosForDate(date)
          const isToday = date === new Date().toISOString().split("T")[0]

          return (
            <div
              key={date}
              className={cn("p-4 cursor-pointer transition-colors", isToday && "ring-2 ring-primary")}
              onClick={() => navigateToDate(date)}
            >
              <div className="text-sm font-medium mb-3 font-mono">{formatDate(date)}</div>
              <div className="space-y-2">
                {dayTodos.slice(0, 3).map((todo) => (
                  <div key={todo.id} className="flex items-center gap-2">
                    <div
                      className={cn(
                        "w-2 h-2 rounded-full",
                        todo.completed ? "bg-[hsl(var(--ds-red-700))]" : "bg-[hsl(var(--ds-red-700))]",
                      )}
                    />
                    <span className={cn("text-xs truncate", todo.completed && "line-through text-muted-foreground")}>
                      {todo.text}
                    </span>
                  </div>
                ))}
                {dayTodos.length > 3 && (
                  <div className="text-xs text-muted-foreground font-mono">+{dayTodos.length - 3} more</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderMonthView = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-light font-mono">
          {new Date(selectedDate).toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <FilterButton />
          <AddButton />
        </div>
      </div>

      {showAddForm && <AddEventForm onSubmit={addTodo} onCancel={() => setShowAddForm(false)} />}

      {showFilter && (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by tags or text..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="flex-1 font-mono"
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-7 gap-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground font-mono">
            {day}
          </div>
        ))}
        {getCurrentMonthDates().map((date) => {
          const dayTodos = getTodosForDate(date)
          const day = new Date(date).getDate()
          const isToday = date === new Date().toISOString().split("T")[0]

          return (
            <div
              key={date}
              className={cn("p-2 min-h-[80px] cursor-pointer transition-colors", isToday && "ring-2 ring-primary")}
              onClick={() => navigateToDate(date)}
            >
              <div className="text-sm font-medium mb-1 font-mono">{day}</div>
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
                  <div className="text-xs text-muted-foreground font-mono">+{dayTodos.length - 2}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  const renderYearView = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h2 className="text-2xl font-light font-mono">{new Date(selectedDate).getFullYear()}</h2>
        <div className="flex gap-2 w-full sm:w-auto">
          <FilterButton />
          <AddButton />
        </div>
      </div>

      {showAddForm && <AddEventForm onSubmit={addTodo} onCancel={() => setShowAddForm(false)} />}

      {showFilter && (
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by tags or text..."
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="flex-1 font-mono"
            />
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const currentYear = new Date(selectedDate).getFullYear()
          const month = new Date(currentYear, monthIndex, 1).toLocaleDateString("en-US", { month: "long" })
          const monthTodos = todos.filter((todo) => {
            const todoDate = new Date(todo.date)
            return todoDate.getMonth() === monthIndex && todoDate.getFullYear() === currentYear
          })

          return (
            <div
              key={monthIndex}
              className="p-4 cursor-pointer transition-colors"
              onClick={() => {
                // Create date string directly to avoid timezone issues
                const dateString = `${currentYear}-${String(monthIndex + 1).padStart(2, "0")}-01`
                setSelectedDate(dateString)
                setCurrentView("Month")
              }}
            >
              <h3 className="font-medium mb-3">{month}</h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-muted-foreground font-mono">
                  <span>Total: {monthTodos.length}</span>
                  <span>Done: {monthTodos.filter((t) => t.completed).length}</span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div
                    className="bg-[hsl(var(--ds-red-700))] h-2 rounded-full transition-all"
                    style={{
                      width: `${monthTodos.length ? (monthTodos.filter((t) => t.completed).length / monthTodos.length) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

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
    const next365DaysTodos = getFilteredTodos(todos.filter((todo) => next365Days.includes(todo.date)))

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
        return <div className="text-sm text-muted-foreground italic py-4">No events to show</div>
      }

      return (
        <div className="space-y-3">
          {displayTodos.map((todo) => (
            <div key={todo.id} className="space-y-1">
              <div
                className="flex items-center gap-2 cursor-pointer p-2 transition-colors"
                onClick={() => navigateToDate(todo.date)}
              >
                <Checkbox checked={todo.completed} onCheckedChange={() => toggleTodo(todo.id)} className="h-4 w-4" />
                <span className={cn("text-base font-medium", todo.completed && "line-through text-muted-foreground")}>
                  {todo.text}
                </span>
                {todo.tags.length > 0 && (
                  <div className="flex gap-1">
                    {todo.tags.slice(0, 1).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs h-4 px-1 font-mono">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {showDates && (
                <div className="text-xs text-muted-foreground ml-8 font-mono">{formatEventDate(todo.date)}</div>
              )}
            </div>
          ))}

          {!showAll && todos.length > 5 && onShowMore && (
            <button onClick={onShowMore} className="text-sm text-primary hover:underline flex items-center gap-1 ml-8">
              <span>Show more</span>
            </button>
          )}
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

          {showAddForm && <AddEventForm onSubmit={addTodo} onCancel={() => setShowAddForm(false)} />}

          {showFilter && (
            <div className="p-4">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter by tags or text..."
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  className="flex-1 font-mono"
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {/* Today */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-medium text-foreground">Today</h3>
              <span className="text-2xl font-light text-primary font-mono">{todayTodos.length}</span>
            </div>
            <EventList todos={todayTodos} showAll showDates={false} />
          </div>

          {/* Next 7 Days */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-medium text-foreground">Next 7 Days</h3>
              <span className="text-2xl font-light text-primary font-mono">{next7DaysTodos.length}</span>
            </div>
            <EventList todos={next7DaysTodos} showAll />
          </div>

          {/* Next 28 Days */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-medium text-foreground">Next 28 Days</h3>
              <span className="text-2xl font-light text-primary font-mono">{next28DaysTodos.length}</span>
            </div>
            <EventList todos={next28DaysTodos} showAll />
          </div>

          {/* Next 365 Days */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-medium text-foreground">Next 365 Days</h3>
              <span className="text-2xl font-light text-primary font-mono">{next365DaysTodos.length}</span>
            </div>
            <EventList todos={next365DaysTodos} showAll={showMore365} onShowMore={() => setShowMore365(true)} />
          </div>
        </div>
      </div>
    )
  }

  const renderCurrentView = () => {
    switch (currentView) {
      case "Days":
        return renderDaysView()
      case "Week":
        return renderWeekView()
      case "Month":
        return renderMonthView()
      case "Year":
        return renderYearView()
      case "Overview":
        return renderOverviewView()
      default:
        return renderDaysView()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                onClick={() => {
                  setSelectedDate(new Date().toISOString().split("T")[0])
                  setCurrentView("Days")
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

      <main className="container mx-auto px-6 py-8">{renderCurrentView()}</main>

      {/* Import/Export buttons at bottom */}
      <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
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
              <Button variant="outline" size="sm" asChild>
                <label htmlFor="ics-import" className="cursor-pointer flex items-center justify-center">
                  <Upload className="h-4 w-4 mr-2" />
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
