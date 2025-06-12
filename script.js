let chartInstance = null;

function readXYZFile(file, callback) {
    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const lines = e.target.result.split('\n');
            const numParticles = parseInt(lines[0].trim());
            const boxLine = lines[1].trim().split(/\s+/);
            
            if (boxLine[0] !== "Timestep") {
                throw new Error("Expected 'Timestep' in second line of .xyz file");
            }

            const boxIndex = boxLine.indexOf("box");
            if (boxIndex === -1) {
                throw new Error("'box' keyword not found in second line of .xyz file");
            }

            const boxData = boxLine.slice(boxIndex + 1, boxIndex + 7).map(parseFloat);
            if (boxData.length < 6) {
                throw new Error("Insufficient data for box dimensions after 'box' keyword");
            }

            const boxSize = [
                boxData[1] - boxData[0], // xhi - xlo
                boxData[3] - boxData[2], // yhi - ylo
                boxData[5] - boxData[4]  // zhi - zlo
            ];

            const positions = [];
            for (let i = 2; i < 2 + numParticles; i++) {
                const parts = lines[i].trim().split(/\s+/);
                if (parts.length >= 4) {
                    positions.push(parts.slice(1, 4).map(parseFloat));
                }
            }

            callback(positions, boxSize);
        } catch (error) {
            document.getElementById('error').textContent = error.message;
        }
    };
    reader.readAsText(file);
}

function computeRDF(positions, boxSize, rMax, numBins) {
    const numParticles = positions.length;
    const rBin = Array.from({ length: numBins + 1 }, (_, i) => (i * rMax) / numBins);
    const dr = rBin[1] - rBin[0];
    const rdf = new Array(numBins).fill(0);

    // Calculate volume and density
    const volume = boxSize[0] * boxSize[1] * boxSize[2];
    const density = numParticles / volume;

    // Compute pairwise distances with periodic boundary conditions
    for (let i = 0; i < numParticles; i++) {
        for (let j = i + 1; j < numParticles; j++) {
            const delta = [
                positions[i][0] - positions[j][0],
                positions[i][1] - positions[j][1],
                positions[i][2] - positions[j][2]
            ];

            // Apply periodic boundary conditions
            for (let k = 0; k < 3; k++) {
                delta[k] = delta[k] - boxSize[k] * Math.round(delta[k] / boxSize[k]);
            }

            // Calculate distance
            const distance = Math.sqrt(delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2]);

            if (distance < rMax) {
                const binIndex = Math.floor(distance / dr);
                if (binIndex < numBins) {
                    rdf[binIndex] += 2; // Count i-j and j-i pairs
                }
            }
        }
    }

    // Normalize RDF
    const normalizedRDF = rdf.map((count, i) => {
        const rInner = i * dr;
        const rOuter = (i + 1) * dr;
        const shellVolume = (4 / 3) * Math.PI * (rOuter ** 3 - rInner ** 3);
        return count / (shellVolume * density * numParticles);
    });

    return { r: rBin.slice(0, -1), rdf: normalizedRDF };
}

function plotRDF(r, rdf) {
    const ctx = document.getElementById('rdfChart').getContext('2d');
    
    if (chartInstance) {
        chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: r.map(val => val.toFixed(2)),
            datasets: [{
                label: 'RDF',
                data: rdf,
                borderColor: '#007bff',
                backgroundColor: 'rgba(0, 123, 255, 0.1)',
                fill: false,
                pointRadius: 0,
                pointHoverRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: true },
                title: {
                    display: true,
                    text: 'Radial Distribution Function'
                }
            },
            scales: {
                x: {
                    title: { display: true, text: 'Distance (Å)' },
                    grid: { display: true }
                },
                y: {
                    title: { display: true, text: 'g(r)' },
                    grid: { display: true }
                }
            }
        }
    });
}

// Event listeners
document.getElementById('fileInput').addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('plotButton').disabled = false;
});

document.getElementById('plotButton').addEventListener('click', function () {
    const file = document.getElementById('fileInput').files[0];
    const rMax = parseFloat(document.getElementById('rMaxInput').value);
    const numBins = parseInt(document.getElementById('numBinsInput').value);

    if (!file) {
        document.getElementById('error').textContent = 'Please select a file first.';
        return;
    }

    if (isNaN(rMax) || rMax <= 0) {
        document.getElementById('error').textContent = 'Please enter a valid radius (rMax > 0).';
        return;
    }

    if (isNaN(numBins) || numBins < 1) {
        document.getElementById('error').textContent = 'Please enter a valid number of bins (numBins ≥ 1).';
        return;
    }

    readXYZFile(file, (positions, boxSize) => {
        const { r, rdf } = computeRDF(positions, boxSize, rMax, numBins);
        plotRDF(r, rdf);
        document.getElementById('error').textContent = '';
    });
});
