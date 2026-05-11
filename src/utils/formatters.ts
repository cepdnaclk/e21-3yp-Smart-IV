export const formatTime = (isoString: string): string => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

export const formatDate = (isoString: string): string => {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString();
};

export const formatVolume = (volume: number): string => {
  return `${volume} mL`;
};

export const formatRate = (rate: number): string => {
  return `${rate} mL/hr`;
};