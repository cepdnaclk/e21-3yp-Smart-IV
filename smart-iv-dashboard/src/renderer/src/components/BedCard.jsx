import React from 'react';

/**
 * BedCard Component
 * Displays the real-time telemetry for a single Smart IV bedside unit.
 * Receives a 'bed' object as a prop containing: bedId, patientName, status, flowRate, volRemaining, battery.
 */
function BedCard({ bed }) {
  // Determine the card's background color based on the bed's current status
  let cardColor = '#e0e0e0'; // Default Grey for DISCONNECTED / STALE
  let statusText = 'OFFLINE';

  if (bed.status === 'STABLE') {
    cardColor = '#d4edda'; // Soft Green
    statusText = 'STABLE (Green)';
  } else if (bed.status === 'ALERT') {
    cardColor = '#fff3cd'; // Soft Yellow
    statusText = 'ALERT (Yellow)';
  } else if (bed.status === 'CRITICAL') {
    cardColor = '#f8d7da'; // Soft Red
    statusText = 'CRITICAL (Red)';
  }

  // Inline styles for quick prototyping (you can move this to CSS later)
  const cardStyle = {
    backgroundColor: cardColor,
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '16px',
    width: '250px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    fontFamily: 'sans-serif',
    color: '#333'
  };

  return (
    <div style={cardStyle}>
      <h3 style={{ margin: '0 0 10px 0', borderBottom: '1px solid rgba(0,0,0,0.1)', paddingBottom: '5px' }}>
        BED {bed.bedId}: {bed.patientName}
      </h3>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <strong>STATUS:</strong> 
        <span style={{ fontWeight: 'bold' }}>{statusText}</span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <strong>FLOW:</strong> 
        <span>{bed.flowRate} mL/hr</span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
        <strong>VOL. REMAINING:</strong> 
        <span>{bed.volRemaining} mL</span>
      </div>
      
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <strong>BATTERY:</strong> 
        <span>{bed.battery}%</span>
      </div>
    </div>
  );
}

export default BedCard;