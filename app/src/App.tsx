import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'
import { WalletProvider } from './components/WalletProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useAnalyticsIdentify } from './hooks/useAnalyticsIdentify'
import Landing from './pages/Landing'
import ComoFunciona from './pages/ComoFunciona'
import CreateGroup from './pages/CreateGroup'
import JoinGroup from './pages/JoinGroup'
import GroupDashboard from './pages/GroupDashboard'
import MyGroups from './pages/MyGroups'
import Seguranca from './pages/Seguranca'

function AnalyticsBridge() {
  useAnalyticsIdentify()
  return null
}

export function App() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <AnalyticsBridge />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/como-funciona" element={<ComoFunciona />} />
            <Route path="/criar" element={<CreateGroup />} />
            <Route path="/entrar/:code" element={<JoinGroup />} />
            <Route path="/grupo/:code" element={<GroupDashboard />} />
            <Route path="/grupos" element={<MyGroups />} />
            <Route path="/seguranca" element={<Seguranca />} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
      <Analytics />
      <SpeedInsights />
    </ErrorBoundary>
  )
}
