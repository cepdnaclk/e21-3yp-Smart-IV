import React, { useState, useEffect } from 'react';
import BedGrid from './components/BedGrid';

function App() {
  const [bedsData, setBedsData] = useState({});
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // 1. Listen to IPC Bridge for data
    const unsubscribe = window.api.onBedUpdate((allBeds) => {
      setBedsData(allBeds);
    });

    // 2. Start the clock for the header
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  // Calculate stats for the bottom summary bar
  const bedArray = Object.values(bedsData);
  const stableCount = bedArray.filter(b => b.status === 'STABLE').length;
  const alertCount = bedArray.filter(b => b.status === 'ALERT').length;
  const criticalCount = bedArray.filter(b => b.status === 'CRITICAL').length;

  // Formatting the date and time
  const timeString = currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateString = currentTime.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  return (
    <div style={{ 
      fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', 
      backgroundColor: '#f0f2f5', 
      height: '100vh', // Force the app to exactly the height of the screen
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden' // Prevent the whole window from scrolling
    }}>
      
      {/* Top Header - Fixed at the top by flexbox */}
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
        <h1 style={{ margin: 0, fontSize: '24px', letterSpacing: '1px' }}>SMART IV WARD DASHBOARD</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', color: '#ccc' }}>{dateString}</div>
            <div style={{ fontSize: '22px', fontWeight: 'bold' }}>{timeString}</div>
          </div>
          <div style={{ width: '40px', height: '40px', backgroundColor: '#ecf0f1', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: '20px' }}>
            👩‍⚕️
          </div>
        </div>
      </header>
      
      {/* Main Grid Area - This is what will scroll */}
      <main style={{ 
        flex: 1, 
        overflowY: 'auto', // Enable vertical scrolling
        paddingBottom: '100px', // Space at bottom so cards aren't hidden by the summary pill
        position: 'relative'
      }}>
        <BedGrid beds={bedsData} />
      </main>

    </div>
  );
}

export default App;