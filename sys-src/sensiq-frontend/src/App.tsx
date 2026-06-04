import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './App.css'
import BentoGrid from './components/BentoGrid'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-950 text-slate-50">
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-0"
          style={{
            background:
              'bg-gradient-to-br from-slate-900/60 via-slate-950/60 to-slate-900/60',
          }}
        />

        <main className="relative z-10 mx-auto max-w-7xl px-6 py-10">
          <BentoGrid />
        </main>
      </div>
    </QueryClientProvider>
  )
}

export default App
