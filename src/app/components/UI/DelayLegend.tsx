export function DelayLegend() {
  return (
    <div className="bg-white rounded-lg shadow-md p-3 text-sm">
      <div className="font-semibold mb-2">Színek jelentése</div>
      
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded-sm" 
            style={{ backgroundColor: '#10b981' }}
          ></div>
          <span>0-4 perc késés</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded-sm" 
            style={{ backgroundColor: '#eab308' }}
          ></div>
          <span>5-19 perc késés</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded-sm" 
            style={{ backgroundColor: '#f97316' }}
          ></div>
          <span>20-59 perc késés</span>
        </div>
        
        <div className="flex items-center gap-2">
          <div 
            className="w-4 h-4 rounded-sm" 
            style={{ backgroundColor: '#ef4444' }}
          ></div>
          <span>60+ perc késés</span>
        </div>
      </div>
    </div>
  );
}