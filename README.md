# Intelligent Disaster Risk Decision-Support System

** Intelligent Identification of Hazard-Based Red Zones, Carrying Capacity Assessment, and Immediate Relocation Needs for Vulnerable Habitations**

Vasunetra is an intelligent disaster-risk decision-support prototype designed to help identify potentially hazardous areas, assess vulnerability and shelter capacity, and prioritise relocation needs for vulnerable habitations.

The system follows an evidence-driven approach:

**Evidence → Risk → Priority → Action**

It combines computer vision-based field image analysis with transparent risk-scoring methods to support informed disaster-management decisions.

## Key Features

### 1. Field Evidence Analysis
- Upload before-and-after photographs of the same location.
- Image quality assessment using sharpness and resolution checks.
- ORB feature detection and Hamming-distance matching.
- Image alignment using Homography and RANSAC.
- Multi-signal change detection using intensity, Lab colour, and local structure.
- Morphological processing and connected-region analysis.
- Change percentage, significant regions, and evidence confidence.
- Visual outputs including aligned images, change masks, overlays, and heatmaps.

### 2. Risk Assessment and Relocation Prioritisation
- Combines slope, rainfall, and measured land changes to calculate a hazard score.
- Considers population exposure, access difficulty, vulnerability, and shelter-capacity pressure.
- Generates explainable risk scores and relocation priorities.
- Uses configurable prototype weights rather than official government risk thresholds.

### 3. Official Dashboard
- Ranked village worklist.
- Risk levels and score breakdowns.
- Vulnerability and carrying-capacity indicators.
- Active alerts.
- Latest field evidence.
- Direct access to Field Analysis.
- Live backend status.

### 4. Citizen Safety Dashboard
- Area-wise risk status.
- Rainfall, terrain, and land-change indicators.
- Safety alerts.
- Safe-zone map and route view.
- Citizen issue reporting.
- Live API data with a fallback demonstration dataset.

### 5. Backend and API
The backend provides endpoints for village information, risk assessment, image analysis, alerts, safe zones, and citizen reports.

## Technology Stack

| Technology | Purpose |
|---|---|
| Python | Core backend programming |
| FastAPI | Backend API development |
| OpenCV | Image processing and change detection |
| NumPy | Numerical operations |
| Pandas | Data handling |
| Uvicorn | ASGI server |
| HTML, CSS, JavaScript | Frontend interface |

## Project Structure

```text
NavyaNova_VASUNETRA/
│
├── backend/
│   ├── main.py
│   ├── scoring.py
│   └── ...
│
├── frontend/
│   └── ...
│
├── GUIDE.md
├── pyproject.toml
├── requirements.txt
├── run.py
└── start_windows.bat
```

*The backend and frontend folders contain the application modules and interface files.*

## Getting Started

### Prerequisites
- Python 3.11 recommended
- Visual Studio Code
- Git

### Installation

**1. Clone the repository**

```bash
git clone https://github.com/vuchougule7-star/NavyaNova_VASUNETRA.git
```

**2. Open the project folder**

```bash
cd NavyaNova_VASUNETRA
```

**3. Create a virtual environment**

```bash
py -3.11 -m venv .venv
```

**4. Activate the environment**

```bash
.venv\Scripts\activate
```

**5. Install dependencies**

```bash
pip install -r requirements.txt
```

**6. Run the application**

```bash
python run.py
```

The application automatically opens the landing page in your default browser.

### Application Pages

Once the server is running, access:

| Page | URL |
|---|---|
| Landing Page | http://127.0.0.1:8000/ |
| Official Dashboard | http://127.0.0.1:8000/official/ |
| Field Analysis | http://127.0.0.1:8000/field/ |
| Citizen Dashboard | http://127.0.0.1:8000/citizen/ |
| API Health | http://127.0.0.1:8000/api/health |

## API Endpoints

| Endpoint | Description |
|---|---|
| `/api/villages` | Retrieve village information |
| `/api/worklist` | Retrieve ranked village worklist |
| `/api/villages/{name}` | Get details of a specific village |
| `/api/detect-change` | Perform image-based change detection |
| `/api/analyze` | Analyse village risk information |
| `/api/summary` | Retrieve dashboard summary |
| `/api/alerts` | Retrieve active alerts |
| `/api/safe-zones/{village}` | Retrieve safe-zone information |
| `/api/citizen/report` | Submit a citizen report |
| `/api/reports` | Retrieve submitted reports |
| `/api/jobs/{job_id}/report` | Retrieve an analysis report |

## Demonstration Workflow

1. Open the Field Analysis page.
2. Select a village.
3. Upload two photographs of the same location taken at different times.
4. Run the change-detection process.
5. Review the detected changes, confidence score, and visual evidence.
6. Open the Official Dashboard.
7. Observe how the measured land-change value contributes to the village risk-scoring model.
8. Open the Citizen Dashboard to view community-facing safety information.

## Future Scope

- Integration of satellite and SAR-based ground-movement evidence.
- Machine learning models trained on validated field images.
- Integration with authoritative live weather and GIS data.
- Offline and low-connectivity field workflows.
- Improved carrying-capacity assessment.
- More advanced evacuation-network modelling.

## Important Disclaimer

Vasunetra is a prototype decision-support system. The included village coordinates, shelter capacities, and certain environmental values are illustrative demonstration data and must be validated against authoritative sources before operational use.

Image-based change detection identifies visible differences between photographs; it does not independently confirm that a change is a landslide or another specific hazard. Field verification and expert assessment remain essential.

## Project Information

- **Project Name:** Vasunetra
- **Project Type:** Intelligent Disaster Risk Decision-Support Prototype

---

**Built with the aim of supporting safer, evidence-based disaster preparedness and community protection.**
