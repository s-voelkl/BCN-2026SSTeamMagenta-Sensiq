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
              'radial-gradient(ellipse 60% 40% at 10% 0%, rgba(245,158,11,0.06) 0%, transparent 70%)',
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
