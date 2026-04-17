import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WalletProvider } from './components/WalletProvider'
import { ErrorBoundary } from './components/ErrorBoundary'
import Landing from './pages/Landing'
import ComoFunciona from './pages/ComoFunciona'
import CreateGroup from './pages/CreateGroup'
import JoinGroup from './pages/JoinGroup'
import GroupDashboard from './pages/GroupDashboard'
import MyGroups from './pages/MyGroups'

export function App() {
  return (
    <ErrorBoundary>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/como-funciona" element={<ComoFunciona />} />
            <Route path="/criar" element={<CreateGroup />} />
            <Route path="/entrar/:code" element={<JoinGroup />} />
            <Route path="/grupo/:code" element={<GroupDashboard />} />
            <Route path="/grupos" element={<MyGroups />} />
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </ErrorBoundary>
  )
}
