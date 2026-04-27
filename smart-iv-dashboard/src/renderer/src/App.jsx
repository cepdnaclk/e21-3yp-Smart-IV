import React, { useState, useEffect } from 'react';
import BedGrid from './components/BedGrid';

function App() {
  const [bedsData, setBedsData] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // 1. Listen for data pushes from the backend
    // The 'unsubscribe' is the cleanup function returned by makeListener in preload
    const unsubscribeUpdate = window.api.onBedUpdate((allBeds) => {
      setBedsData(allBeds);
    });

    const unsubscribeAlert = window.api.onNewAlert((alert) => {
      console.log("🚨 New Alert Received:", alert);
      // You could trigger a Toast notification or Sound here
    });

    // 2. Start the system clock
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // CLEANUP: This is critical for performance
    return () => {
      clearInterval(timer);
      unsubscribeUpdate();
      unsubscribeAlert();
    };
  }, []);

  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateString = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ 
      fontFamily: 'Segoe UI, sans-serif', 
      backgroundColor: '#f0f2f5', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden' 
    }}>
      <header style={{ 
        backgroundColor: '#2c3e50', 
        color: 'white', 
        padding: '15px 30px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        boxShadow: '0 2px 5px rgba(0,0,0,0.2)', 
        zIndex: 10 
      }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '24px' }}>SMART IV WARD DASHBOARD</h1>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '14px', color: '#ccc' }}>{dateString}</div>
          <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{timeString}</div>
        </div>
      </header>
      
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: '100px' }}>
        <BedGrid beds={bedsData} />
      </main>
    </div>
  );
}

export default App;