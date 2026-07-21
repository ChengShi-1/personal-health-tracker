import {StrictMode} from 'react'; import {createRoot} from 'react-dom/client'; import App from './App'; import './styles.css'; import './workout.css'; import './muscle-heatmap.css'; import './daily-training.css'; import './health-chat.css'; import './cloud-sync.css'; import './mobile.css';
createRoot(document.getElementById('root')!).render(<StrictMode><App/></StrictMode>);
