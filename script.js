const statusEl = document.getElementById('status');
const heroReadout = document.getElementById('heroReadout');
const statsSlide = document.getElementById('statsSlide');
const forecastSlide = document.getElementById('forecastSlide');
const emptyState = document.getElementById('emptyState');
const heroBg = document.getElementById('heroBg');

let cityOffsetSeconds = 0;
let clockTimer = null;

const WEATHER_CODES = {
  0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
  45:'Fog',48:'Depositing fog',
  51:'Light drizzle',53:'Drizzle',55:'Dense drizzle',
  61:'Slight rain',63:'Rain',65:'Heavy rain',
  71:'Slight snow',73:'Snow',75:'Heavy snow',
  80:'Rain showers',81:'Rain showers',82:'Violent rain showers',
  95:'Thunderstorm',96:'Thunderstorm w/ hail',99:'Thunderstorm w/ hail'
};

function condText(code){ return WEATHER_CODES[code] || 'Unknown'; }

function formatClock(date){
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  return { time, day };
}

// top-right clock: viewer's own local time
function tickHeaderClock(){
  const { time, day } = formatClock(new Date());
  document.getElementById('clockTime').textContent = time;
  document.getElementById('clockDate').textContent = day;
}
setInterval(tickHeaderClock, 1000);
tickHeaderClock();

// searched-city local time, using the city's UTC offset returned by the API
function tickCityClock(){
  const nowUtcMs = Date.now();
  const cityMs = nowUtcMs + cityOffsetSeconds * 1000;
  const cityDate = new Date(cityMs);
  const time = cityDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  const day = cityDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  document.getElementById('localTime').textContent = `${day} · ${time} local`;
}

async function geocode(city){
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Geocoding request failed');
  const data = await res.json();
  if(!data.results || data.results.length === 0) throw new Error('City not found. Try a different spelling.');
  return data.results[0];
}

async function getWeather(lat, lon){
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code` +
    `&hourly=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=auto`;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Weather request failed');
  return res.json();
}

function setHeroImage(city){
  const img = new Image();
  const query = encodeURIComponent(city + ' city skyline');
  const src = `https://source.unsplash.com/1600x900/?${query}`;
  img.onload = () => {
    heroBg.style.backgroundImage = `url(${src})`;
    heroBg.classList.add('loaded');
  };
  img.onerror = () => {
    heroBg.classList.remove('loaded');
  };
  img.src = src;
}

function renderCurrent(place, weather){
  const c = weather.current;
  const daily = weather.daily;

  document.getElementById('placeName').textContent = `${place.name}${place.admin1 ? ', ' + place.admin1 : ''}`;
  document.getElementById('placeCountry').textContent = place.country || '';

  cityOffsetSeconds = weather.utc_offset_seconds || 0;
  tickCityClock();
  if(clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(tickCityClock, 1000);

  document.getElementById('tempNow').innerHTML = `${Math.round(c.temperature_2m)}<sup>°C</sup>`;
  document.getElementById('condNow').textContent = condText(c.weather_code);
  document.getElementById('feelsLike').textContent = `${Math.round(c.apparent_temperature)}°`;
  document.getElementById('wind').textContent = `${Math.round(c.wind_speed_10m)} km/h`;
  document.getElementById('humidity').textContent = `${c.relative_humidity_2m}%`;

  const tMin = daily.temperature_2m_min[0];
  const tMax = daily.temperature_2m_max[0];
  document.getElementById('minLabel').textContent = `min ${Math.round(tMin)}°`;
  document.getElementById('maxLabel').textContent = `max ${Math.round(tMax)}°`;

  let pct = ((c.temperature_2m - tMin) / (tMax - tMin || 1)) * 100;
  pct = Math.max(2, Math.min(98, pct));
  document.getElementById('marker').style.left = pct + '%';

  heroReadout.style.display = 'flex';
}

function renderHourly(weather){
  const hourly = weather.hourly;
  const nowIndex = hourly.time.findIndex(t => new Date(t) >= new Date());
  const start = nowIndex === -1 ? 0 : nowIndex;
  const box = document.getElementById('hourly');
  box.innerHTML = '';
  for(let i = start; i < start + 8 && i < hourly.time.length; i++){
    const d = new Date(hourly.time[i]);
    const label = d.toLocaleTimeString([], { hour: 'numeric' });
    box.innerHTML += `
      <div class="hour-card">
        <div class="t">${label}</div>
        <div class="v">${Math.round(hourly.temperature_2m[i])}°</div>
      </div>`;
  }
}

function renderDaily(weather){
  const daily = weather.daily;
  const box = document.getElementById('days');
  box.innerHTML = '';
  for(let i = 0; i < 5 && i < daily.time.length; i++){
    const d = new Date(daily.time[i]);
    const name = i === 0 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' });
    box.innerHTML += `
      <div class="day-row">
        <div class="name">${name}</div>
        <div class="cond">${condText(daily.weather_code[i])}</div>
        <div class="range"><b>${Math.round(daily.temperature_2m_max[i])}°</b> / ${Math.round(daily.temperature_2m_min[i])}°</div>
      </div>`;
  }
}

async function runSearch(){
  const city = document.getElementById('cityInput').value.trim();
  if(!city){
    statusEl.textContent = 'Please type a city name first.';
    statusEl.classList.add('error');
    return;
  }
  statusEl.classList.remove('error');
  statusEl.textContent = 'Looking that up...';
  emptyState.style.display = 'none';

  try{
    const place = await geocode(city);
    const weather = await getWeather(place.latitude, place.longitude);
    setHeroImage(place.name);
    renderCurrent(place, weather);
    renderHourly(weather);
    renderDaily(weather);
    statusEl.textContent = `Showing weather for ${place.name}.`;
    statsSlide.style.display = 'block';
    forecastSlide.style.display = 'block';
  }catch(err){
    statusEl.textContent = err.message || 'Something went wrong. Try another city.';
    statusEl.classList.add('error');
    emptyState.style.display = 'block';
  }
}

document.getElementById('searchBtn').addEventListener('click', runSearch);
document.getElementById('cityInput').addEventListener('keydown', e => {
  if(e.key === 'Enter') runSearch();
});

// Load a default city on first visit
document.getElementById('cityInput').value = 'Vijayawada';
runSearch();