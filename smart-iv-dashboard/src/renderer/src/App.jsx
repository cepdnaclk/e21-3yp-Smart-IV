import React, { useState, useEffect } from 'react';
import BedGrid from './components/BedGrid';

function App() {
  // State to hold the live data dictionary from the backend
  const [bedsData, setBedsData] = useState({});

  useEffect(() => {
    // 1. Connect to the IPC Bridge using the 'api' object exposed in preload.js
    // We pass a callback function that updates our React state whenever the backend pushes new data.
    const unsubscribe = window.api.onBedUpdate((allBeds) => {
      setBedsData(allBeds);
    });

    // Cleanup function when the component unmounts (good React practice)
    return () => {
      // If we implemented an unsubscribe in preload, we would call it here
    };
  }, []); // Empty dependency array ensures this listener is only set up once

  return (
    <div style={{ fontFamily: 'sans-serif', backgroundColor: '#f4f7f6', minHeight: '100vh' }}>
      <header style={{ backgroundColor: '#2c3e50', color: 'white', padding: '15px 20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px' }}>SMART IV WARD DASHBOARD</h1>
      </header>
      
      <main>
        {/* Pass the live data down into our Grid component */}
        <BedGrid beds={bedsData} />
      </main>
    </div>
  );
}

export default App;