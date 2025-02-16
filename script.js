document.getElementById('search-btn').addEventListener('click', function() {
    let city = document.getElementById('city-input').value;
    if (city) {
        fetch(`http://api.weatherapi.com/v1/current.json?key=1c5bce56de654471a8965736251602&q=${city}&aqi=yes`)
        .then(response => response.json())
        .then(data => {
            let localTime = data.location.localtime; // Extract local time from API
            document.getElementById('weather-info').innerHTML = `
                <h2>${data.location.name}, ${data.location.country}</h2>
                <p><strong>Local Time:</strong> ${localTime}</p>
                <p><strong>Temperature:</strong> ${data.current.temp_c}°C</p>
                <p><strong>Condition:</strong> ${data.current.condition.text}</p>
                <p><strong>Humidity:</strong> ${data.current.humidity}%</p>
                <p><strong>Wind Speed:</strong> ${data.current.wind_kph} km/h</p>
            `;
        })
        .catch(() => {
            document.getElementById('weather-info').innerHTML = `<p style="color: red;">City not found!</p>`;
        });
    } else {
        alert("Please enter a city name.");
    }
});
