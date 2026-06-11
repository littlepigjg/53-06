import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { UploadPage } from '@/pages/UploadPage';
import { ReviewPage } from '@/pages/ReviewPage';
import { AdminPage } from '@/pages/AdminPage';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<UploadPage />} />
        <Route path="/review/:token" element={<ReviewPage />} />
        <Route path="/admin/:docId" element={<AdminPage />} />
        <Route path="*" element={<UploadPage />} />
      </Routes>
    </Router>
  );
}
