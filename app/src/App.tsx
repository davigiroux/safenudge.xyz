import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WalletProvider } from './components/WalletProvider'
import Landing from './pages/Landing'
import CreateGroup from './pages/CreateGroup'
import JoinGroup from './pages/JoinGroup'
import GroupDashboard from './pages/GroupDashboard'
import MyGroups from './pages/MyGroups'

export function App() {
  return (
    <WalletProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/criar" element={<CreateGroup />} />
          <Route path="/entrar/:code" element={<JoinGroup />} />
          <Route path="/grupo/:code" element={<GroupDashboard />} />
          <Route path="/grupos" element={<MyGroups />} />
        </Routes>
      </BrowserRouter>
    </WalletProvider>
  )
}
