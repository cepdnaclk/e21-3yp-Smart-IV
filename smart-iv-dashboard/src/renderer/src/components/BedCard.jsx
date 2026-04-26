import React from 'react';

/**
 * BedCard Component
 * Displays real-time telemetry for a single Smart IV bedside unit.
 * Mapped to match the medical-grade relational schema.
 */
function BedCard({ bed }) {
  // 1. NaN Safety: Fallback to 0 if data is missing or undefined
  const flowRate = bed.flowRate || 0;
  const volRemaining = bed.volRemaining || 0;
  const battery = bed.battery || 0;

  // 2. Determine styling and icons based on the status
  let headerColor = '#6c757d'; // Default Grey (Offline)
  let headerIcon = '❔';
  let statusText = 'OFFLINE';
  let isGlowing = false;

  if (bed.status === 'STABLE') {
    headerColor = '#28a745'; // Green
    headerIcon = '';
    statusText = 'STABLE (Green)';
  } else if (bed.status === 'ALERT') {
    headerColor = '#ffc107'; // Yellow
    headerIcon = '';
    statusText = 'Flow rate deviation';
  } else if (bed.status === 'CRITICAL') {
    headerColor = '#dc3545'; // Red
    headerIcon = '';
    statusText = 'CRITICAL: No Flow';
    isGlowing = true; // Triggers the red outer glow for emergency visibility
  } else if (bed.status === 'DISCONNECTED') { //Explicit case
    headerColor = '#6c757d';
    headerIcon = '';
    statusText = 'DISCONNECTED';
  }

  // 3. Battery Visual Logic
  let batteryColor = '#28a745'; // Green
  if (battery <= 20) batteryColor = '#dc3545'; // Red
  else if (battery <= 50) batteryColor = '#fd7e14'; // Orange

  // 4. Volume Remaining Progress Bar Calculation
  // Assuming a standard 500mL IV bag for the percentage calculation
  const maxVolume = 500; 
  const volumePercentage = Math.max(0, Math.min((volRemaining / maxVolume) * 100, 100));

  // Visual feedback: Change the progress bar color as the bag empties
  let volBarColor = '#6ca0dc'; // Default Blue
  if (volumePercentage <= 10) volBarColor = '#dc3545'; // Red if < 10%
  else if (volumePercentage <= 25) volBarColor = '#ffc107'; // Yellow if < 25%

  // 5. Component Internal Styles
  const cardStyle = {
    backgroundColor: '#ffffff',
    borderRadius: '10px',
    width: '320px',
    boxShadow: isGlowing ? '0 0 15px rgba(220, 53, 69, 0.6)' : '0 4px 8px rgba(0,0,0,0.1)',
    fontFamily: 'Segoe UI, Tahoma, sans-serif',
    color: '#333',
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
      {/* Top Banner with Patient Info */}
      <div style={headerStyle}>
        {/*<span>{headerIcon}</span>*/}
        <span>BED {bed.bedId}</span>
      </div>
      
      {/* Telemetry Data Grid */}
      <div style={bodyStyle}>
        <div style={rowStyle}>
          <strong>STATUS:</strong> 
          <span style={{ fontWeight: 'bold' }}>{statusText}</span>
        </div>
        
        <div style={rowStyle}>
          <strong>FLOW:</strong> 
          {/* Formatted to 1 decimal place for the simulation "wiggle" */}
          <span style={{ fontFamily: 'monospace', fontSize: '16px' }}>
            {flowRate.toFixed(1)} mL/hr
          </span>
        </div>
        
        <div style={rowStyle}>
          <strong>VOL. REMAINING:</strong> 
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Draining Progress Bar */}
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
            <span style={{ fontFamily: 'monospace' }}>{volRemaining.toFixed(2)} mL</span>
          </div>
        </div>
        
        <div style={rowStyle}>
          <strong>BATTERY:</strong> 
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
             <span style={{ color: batteryColor, fontSize: '18px' }}></span> 
             {battery}%
          </span>
        </div>
      </div>
    </div>
  );
}

export default BedCard;