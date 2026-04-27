import React from 'react';

/**
 * Restored BedCard Component
 * Reverts to the high-visibility "Classic" UI while maintaining 
 * the new Session and Hydration backend logic.
 */
function BedCard({ bed }) {
  // Data normalization for the new backend logic
  const flowRate = bed.flowRate ?? 0;
  const volRemaining = bed.volRemaining ?? 0;
  const battery = bed.battery ?? 0;
  const maxVolume = bed.maxVolume || 500; 

  // Determine styling based on the status
  let headerColor = '#6c757d'; // Default Grey (Offline)
  let statusText = 'OFFLINE';
  let isGlowing = false;

  if (bed.status === 'STABLE') {
    headerColor = '#28a745'; // Green
    statusText = 'STABLE (Green)';
  } else if (bed.status === 'ALERT') {
    headerColor = '#ffc107'; // Yellow
    statusText = 'Flow rate deviation';
  } else if (bed.status === 'CRITICAL') {
    headerColor = '#dc3545'; // Red
    statusText = 'CRITICAL: No Flow';
    isGlowing = true; 
  } else if (bed.status === 'DISCONNECTED') { 
    headerColor = '#2c3e50';
    statusText = 'RE-CONNECTING...';
  }

  // Battery Visual Logic
  let batteryColor = '#28a745';
  if (battery <= 20) batteryColor = '#dc3545';
  else if (battery <= 50) batteryColor = '#fd7e14';

  // Volume Progress Calculation
  const volumePercentage = Math.max(0, Math.min((volRemaining / maxVolume) * 100, 100));

  // Visual feedback for progress bar
  let volBarColor = '#6ca0dc'; 
  if (volumePercentage <= 10) volBarColor = '#dc3545';
  else if (volumePercentage <= 25) volBarColor = '#ffc107';

  // RESTORED OLD UI STYLES
  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    width: '320px',
    boxShadow: isGlowing ? '0 0 15px rgba(220, 53, 69, 0.6)' : '0 4px 8px rgba(0,0,0,0.1)',
    fontFamily: 'Segoe UI, Tahoma, sans-serif',
    color: '#333', // Explicitly set dark text for visibility
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden', 
    border: isGlowing ? '2px solid #dc3545' : '1px solid #e0e0e0',
    transition: 'all 0.3s ease'
  };

  const headerStyle = {
    backgroundColor: headerColor,
    color: bed.status === 'ALERT' ? '#333' : '#fff',
    padding: '12px 15px',
    fontSize: '18px',
    fontWeight: 'bold',
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  };

  const bodyStyle = {
    padding: '15px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    fontSize: '15px'
  };

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  };

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <span>BED {bed.bedId}</span>
      </div>
      
      <div style={bodyStyle}>
        <div style={rowStyle}>
          <strong>STATUS:</strong> 
          <span style={{ fontWeight: 'bold' }}>{statusText}</span>
        </div>
        
        <div style={rowStyle}>
          <strong>FLOW:</strong> 
          <span style={{ fontFamily: 'monospace', fontSize: '16px', color: '#000' }}>
            {flowRate.toFixed(1)} mL/hr
          </span>
        </div>
        
        <div style={rowStyle}>
          <strong>VOL. REMAINING:</strong> 
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ 
              width: '80px', 
              height: '14px', 
              backgroundColor: '#e9ecef', 
              borderRadius: '7px', 
              overflow: 'hidden', 
              border: '1px solid #ced4da' 
            }}>
              <div style={{ 
                width: `${volumePercentage}%`, 
                height: '100%', 
                backgroundColor: volBarColor, 
                transition: 'width 0.5s ease-in-out' 
              }}></div>
            </div>
            <span style={{ fontFamily: 'monospace', color: '#000' }}>
              {volRemaining.toFixed(2)} mL
            </span>
          </div>
        </div>
        
        <div style={rowStyle}>
          <strong>BATTERY:</strong> 
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold', color: '#000' }}>
             {battery}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default BedCard;