import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  CSS2DRenderer,
  CSS2DObject,
} from "three/addons/renderers/CSS2DRenderer.js";

let mesh;
let scene, camera, renderer, controls, raycaster, mouse, labelRenderer;
let activeLandmark = null;
let activeTransformControl = null;
const createdLandmarks = {};
const landmarkLabels = {};
let lines = [];
let plane = null;
let projectedTEAAxisLine = null;
let projectedTEALabel = null;
let anteriorLine = null;
let anteriorLabel = null;
let varusValgusPlane = null; // Store the reference to the Varus/Valgus plane
let projectedAnteriorLine = null; // Reference for the Projected Anterior Line
let lateralLine = null; // Reference for the Lateral Line
let projectedAnteriorLabel = null;
let lateralLineLabel = null;
// Initialize scene, camera, and renderer
function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);

  camera = new THREE.PerspectiveCamera(
    80,
    window.innerWidth / window.innerHeight,
    0.1,
    3000
  );

  // Create a container for both renderers
  const container = document.createElement("div");
  container.style.position = "relative";
  document.body.appendChild(container);

  // Main WebGL renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // CSS2D renderer
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(window.innerWidth, window.innerHeight);
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.top = "0";
  labelRenderer.domElement.style.left = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  container.appendChild(labelRenderer.domElement);

  // Add lighting
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight.position.set(-1, -1, -1);
  scene.add(directionalLight);

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1.5);
  directionalLight2.position.set(1, 1, 1);
  scene.add(directionalLight2);

  camera.position.set(250, -81, 840);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.25;

  // // Initialize raycaster and mouse
  // raycaster = new THREE.Raycaster();
  // mouse = new THREE.Vector2();

  // // Add event listener for mouse clicks to locate position
  // window.addEventListener("click", function (event) {
  //   // Convert mouse click to normalized device coordinates (-1 to +1 range)
  //   mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  //   mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  //   // Update the raycaster with the camera and mouse position
  //   raycaster.setFromCamera(mouse, camera);

  //   // Calculate objects intersecting the ray
  //   const intersects = raycaster.intersectObjects(scene.children, true);

  //   if (intersects.length > 0) {
  //     const intersectionPoint = intersects[0].point;
  //     console.log("Intersection point:", intersectionPoint);

  //     // You can now use the `intersectionPoint` to place objects or visualize it
  //     // Example: Creating a sphere at the intersection point
  //     const sphereGeometry = new THREE.SphereGeometry(2, 32, 32);
  //     const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
  //     const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
  //     sphere.position.copy(intersectionPoint);
  //     scene.add(sphere);
  //   }
  // });

  const loader = new STLLoader();
  const meshes = [];
  let totalBoundingBox = new THREE.Box3();

  // Load STL model
  loader.load("Right_Femur.stl", function (geometry) {
    const material = new THREE.MeshStandardMaterial({
      color: 0xf1daa4,
      transparent: true,
      // opacity: 0.6,
    });
    mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    meshes.push(mesh);

    const boundingBox = new THREE.Box3().setFromObject(mesh);
    totalBoundingBox.union(boundingBox);

    loader.load("Right_Tibia.stl", function (geometry) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xf1daa4,
        transparent: true,
        opacity: 0.6,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      meshes.push(mesh);

      const boundingBox = new THREE.Box3().setFromObject(mesh);
      totalBoundingBox.union(boundingBox);
      totalBoundingBox.getCenter(camera.position);
      camera.position.set(-72, 520, 700);
      controls.target.copy(totalBoundingBox.getCenter(new THREE.Vector3()));
      controls.update();
    });
  });

  // Add event listener for mouse clicks
  window.addEventListener("click", onMouseClick, false);

  // Add event listeners to landmark buttons
  document.querySelectorAll(".landmark-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveLandmark(btn);
    });
  });

  animate();
}

let distalMedialClipPlane = null; // Clipping plane for the Distal Medial Plane
let distalResectionClipPlane = null; // Clipping plane for the Distal Resection Plane

let resectionEnabled = false; // Toggle state for resection

// Create a clipping plane for the distal resection
// Create clipping planes for the distal resection and distal medial planes
// Apply the clipping planes to the femur mesh, clipping between the two planes
function applyClipping() {
  if (mesh && distalMedialClipPlane && distalResectionClipPlane) {
    renderer.localClippingEnabled = true; // Enable clipping globally in the renderer

    // Ensure the clipping planes face in opposite directions
    // distalMedialClipPlane.negate(); // Flip the direction of the distal medial plane

    // Apply both clipping planes to the femur mesh
    mesh.material.clippingPlanes = [
      distalResectionClipPlane, // This will clip the part below the distal resection plane
      distalMedialClipPlane, // This will clip the part above the distal medial plane
    ];
    mesh.material.needsUpdate = true; // Ensure the material updates
  }
}

// Remove the clipping planes and show the entire model
function removeClipping() {
  if (mesh) {
    renderer.localClippingEnabled = false; // Disable clipping globally in the renderer
    mesh.material.clippingPlanes = []; // Remove all clipping planes
    mesh.material.needsUpdate = true; // Ensure the material updates
  }
}

// Initialize the clipping planes
function createClippingPlanes() {
  const medialPlaneNormal = new THREE.Vector3(0, 0, 1); // Normal direction for both planes
  const resectionPlanePosition = new THREE.Vector3(-65, -74, 725); // Distal resection plane position
  const medialPlanePosition = new THREE.Vector3(-65, -74, 725); // Distal medial plane position

  // Create the clipping planes
  distalResectionClipPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    medialPlaneNormal,
    resectionPlanePosition
  );
  distalMedialClipPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
    medialPlaneNormal,
    medialPlanePosition
  );
}

// Toggle button to enable/disable the resection
document
  .getElementById("toggle-resection-button")
  .addEventListener("click", () => {
    resectionEnabled = !resectionEnabled;

    if (resectionEnabled) {
      // createClippingPlanes();
      applyClipping(); // Apply clipping to slice the area between the two planes
      console.log(
        "Resection enabled: Slicing the femur between Distal Medial and Distal Resection planes."
      );
      showMeasurements();
    } else {
      removeClipping(); // Remove clipping planes
      console.log("Resection disabled: Showing the full femur.");
    }
  });

// Set the active landmark and update button styles
function setActiveLandmark(button) {
  // If another landmark is active, deactivate it
  if (activeLandmark) {
    activeLandmark.classList.remove("active");
  }

  // Set the new active landmark
  activeLandmark = button;
  activeLandmark.classList.add("active");

  console
    .log
    // Active Landmark: ${activeLandmark.getAttribute("data-landmark").trim()}
    ();
}

// Define fixed positions for each landmark type
const landmarkPositions = {
  femurCenter: new THREE.Vector3(-58.3, -86, 731.5),
  hipCenter: new THREE.Vector3(-77.6, -85.4, 1135.3),
  femurProximalCanal: new THREE.Vector3(-112, -118, 1123.7),
  femurDistalCanal: new THREE.Vector3(-61.9, -120, 740),
  medialEpicondyle: new THREE.Vector3(-30.8, -58.2, 741.3),
  lateralEpicondyle: new THREE.Vector3(-90.8, -63.7, 735.5),
  distalMedialPt: new THREE.Vector3(-31.4, -72.5, 714),
  distalLateralPt: new THREE.Vector3(-80.8, -77, 716.3),
  posteriorMedialPt: new THREE.Vector3(-33.4, -61, 745),
  posteriorLateralPt: new THREE.Vector3(-87.4, -64.5, 741.9),
};

// Add event listener for mouse clicks on landmarks
function onMouseClick(event) {
  // If no active landmark, do nothing
  if (!activeLandmark) {
    console.log("No active landmark selected.");
    return;
  }

  const landmarkType = activeLandmark.getAttribute("data-landmark").trim();
  const position = landmarkPositions[landmarkType];

  if (position) {
    let sphere = createdLandmarks[landmarkType];

    if (!sphere) {
      const sphereGeometry = new THREE.SphereGeometry(2, 32, 32);
      const sphereMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 });
      sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);

      sphere.position.copy(position);
      sphere.userData.landmarkType = landmarkType;

      createdLandmarks[landmarkType] = sphere;
      scene.add(sphere);
      // console.log(
      // Landmark created: ${landmarkType} at position: ${position.toArray()}
      // );

      // Create and add CSS2D label for the landmark
      const label = createCSS2DLabel(landmarkType);
      sphere.add(label);
      landmarkLabels[landmarkType] = label;
    }

    if (activeTransformControl) {
      activeTransformControl.detach();
      scene.remove(activeTransformControl);
    }

    // Reattach TransformControls only if there's an active landmark
    activeTransformControl = new TransformControls(camera, renderer.domElement);
    activeTransformControl.attach(sphere);
    scene.add(activeTransformControl);
    activeTransformControl.setMode("translate");

    // Disable OrbitControls when TransformControls is active
    activeTransformControl.addEventListener(
      "dragging-changed",
      function (event) {
        controls.enabled = !event.value;
      }
    );

    activeTransformControl.addEventListener("objectChange", () => {
      sphere.scale.set(1, 1, 1);
      console
        .log
        // Landmark ${landmarkType} moved to: ${sphere.position.toArray()}
        ();
      landmarkPositions[landmarkType] = sphere.position.clone();
    });
  } else {
    console.log("No predefined position for the selected landmark.");
  }
}

function createCSS2DLabel(text) {
  const div = document.createElement("div");
  div.className = "label";
  div.textContent = text;
  div.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
  div.style.color = "white";
  div.style.padding = "2px 6px";
  div.style.borderRadius = "3px";
  div.style.fontSize = "8px";
  div.style.pointerEvents = "none";
  div.style.fontFamily = "Arial, sans-serif";
  div.style.fontWeight = "bold";

  const label = new CSS2DObject(div);
  label.position.set(0, 10, 0); // Offset the label slightly above the landmark
  return label;
}

// Create lines between landmarks when the "Update" button is clicked
document.addEventListener("DOMContentLoaded", () => {
  const updateButton = document.getElementById("update-button");
  if (updateButton) {
    updateButton.addEventListener("click", createAxes);
  }
});

// Function to create a plane perpendicular to the Mechanical Axis at the end point
function createPlaneAtEnd(startKey, endKey, color, planeSize = 100) {
  const start = landmarkPositions[endKey];
  const end = landmarkPositions[startKey];

  if (!start || !end) {
    console
      .log
      // Cannot create plane. Landmark positions missing for ${startKey} or ${endKey}.
      ();
    return;
  }

  // Calculate direction vector for the normal
  const direction = new THREE.Vector3().subVectors(end, start).normalize();

  // Use the 'end' position to place the plane at the end of the axis
  const planePosition = end.clone();

  // Create the plane geometry
  const planeGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
  const planeMaterial = new THREE.MeshBasicMaterial({
    color: color,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.5, // Make the plane semi-transparent
  });

  plane = new THREE.Mesh(planeGeometry, planeMaterial);

  // Align the plane to be perpendicular to the direction vector
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
  plane.quaternion.copy(quaternion);

  // Position the plane at the 'end' point
  plane.position.copy(planePosition);

  // Add the plane to the scene
  scene.add(plane);

  // console.log(Plane created at the end of the Mechanical Axis.);
}

// Function to project TEA Axis on the perpendicular plane
function projectTEAAxisOnPlane() {
  const medialEpicondyle = landmarkPositions["medialEpicondyle"];
  const lateralEpicondyle = landmarkPositions["lateralEpicondyle"];

  if (!plane || !medialEpicondyle || !lateralEpicondyle) {
    console.log("Cannot project TEA axis. Plane or landmarks are not defined.");
    return;
  }

  // Helper function to project a point onto a plane
  function projectPointOntoPlane(point, plane) {
    // Get the plane normal from the plane's world matrix
    const planeNormal = new THREE.Vector3();
    planeNormal.set(
      plane.matrixWorld.elements[8], // x
      plane.matrixWorld.elements[9], // y
      plane.matrixWorld.elements[10] // z
    );

    // Calculate the distance from the point to the plane
    const pointToPlane = new THREE.Vector3().subVectors(point, plane.position);
    const distance = pointToPlane.dot(planeNormal);

    // Project the point onto the plane
    const projectedPoint = new THREE.Vector3()
      .copy(point)
      .sub(planeNormal.multiplyScalar(distance));

    return projectedPoint;
  }

  // Project medial and lateral epicondyle onto the plane
  const projectedMedial = projectPointOntoPlane(medialEpicondyle, plane);
  const projectedLateral = projectPointOntoPlane(lateralEpicondyle, plane);
  const points = [projectedMedial, projectedLateral];

  if (projectedTEAAxisLine) {
    // Update the existing line geometry
    projectedTEAAxisLine.geometry.setFromPoints(points);
    console.log("Updated Projected TEA Axis.");
  } else {
    // Create the line for the first time
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    projectedTEAAxisLine = new THREE.Line(geometry, material);
    scene.add(projectedTEAAxisLine);
    console.log("Created Projected TEA Axis.");
  }

  // Update or create the label for the Projected TEA Axis
  const midpoint = projectedMedial.clone().lerp(projectedLateral, 0.5);
  if (projectedTEALabel) {
    projectedTEALabel.position.copy(midpoint);
    console.log("Updated Projected TEA Axis label.");
  } else {
    projectedTEALabel = createTextLabel("Projected TEA Axis");
    projectedTEALabel.position.copy(midpoint);
    scene.add(projectedTEALabel);
    console.log("Created Projected TEA Axis label.");
  }
}

// Modify the createAxes function to include the creation of the plane at the end of the axis
function createAxes() {
  // Clear existing lines and labels
  lines.forEach((line) => scene.remove(line));
  lines = [];
  if (plane) {
    scene.remove(plane);
    plane = null;
  }

  // Detach the active TransformControls if attached to any object
  if (activeTransformControl) {
    activeTransformControl.detach();
    scene.remove(activeTransformControl);
    activeTransformControl = null; // Reset to prevent further interaction
  }

  // Reset the active landmark to prevent reactivating TransformControls until a new landmark is clicked
  if (activeLandmark) {
    activeLandmark.classList.remove("active");
    activeLandmark = null;
  }
  // Create a line between Femur Center & Hip Center (Mechanical Axis)
  createLine("femurCenter", "hipCenter", 0x0000ff, "Mechanical Axis");

  // Create a plane at the end of the Mechanical Axis
  createPlaneAtEnd("femurCenter", "hipCenter", 0x00ff00, 150);

  // Create a line between Femur Proximal Canal & Femur Distal Canal (Anatomical Axis)
  createLine(
    "femurProximalCanal",
    "femurDistalCanal",
    0x0000ff,
    "Anatomical Axis"
  );

  // Create a line between Medial Epicondyle & Lateral Epicondyle (TEA - Trans Epicondyle Axis)
  createLine(
    "medialEpicondyle",
    "lateralEpicondyle",
    0x0000ff,
    "TEA - Trans Epicondyle Axis"
  );

  // Create a line between Posterior Medial Pt & Posterior Lateral Pt (PCA - Posterior Condyle Axis)
  createLine(
    "posteriorMedialPt",
    "posteriorLateralPt",
    0x0000ff,
    "PCA - Posterior Condyle Axis"
  );

  // Create the projected TEA axis on the plane
  projectTEAAxisOnPlane();
  createAnteriorLine();
  projectAnteriorLineOnVarusValgusPlane();
  createLateralLineOnVarusValgusPlane();
  createDistalMedialPlane();
  createDistalResectionPlane();
  createClippingPlanes();

  console.log(
    "Axes and plane created or updated based on the current landmark positions."
  );
}

// Helper function to create a line between two landmarks and add a label
function createTextLabel(text) {
  const div = document.createElement("div");
  div.className = "label";
  div.textContent = text;
  div.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
  div.style.color = "white";
  div.style.padding = "2px 6px";
  div.style.borderRadius = "3px";
  div.style.fontSize = "10px";
  div.style.fontFamily = "Arial, sans-serif";
  div.style.pointerEvents = "none";

  const label = new CSS2DObject(div);
  return label;
}

// Modify the createLine function to use createTextLabel
function createLine(startKey, endKey, color, label) {
  const start = landmarkPositions[startKey];
  const end = landmarkPositions[endKey];

  if (!start || !end) {
    console
      .log
      // Cannot create line. Landmark positions missing for ${startKey} or ${endKey}.
      ();
    return;
  }

  console
    .log
    // Creating line from ${startKey} (${start.toArray()}) to ${endKey} (${end.toArray()})
    ();
  const points = [start, end];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: color });
  const line = new THREE.Line(geometry, material);
  scene.add(line);
  lines.push(line);

  // Create label for the line
  const textLabel = createTextLabel(label);
  textLabel.position.copy(start.clone().lerp(end, 0.5));
  scene.add(textLabel);
  lines.push(textLabel);

  // console.log(${label} created between ${startKey} and ${endKey}.);
}

// Add this function to handle the update button click
function handleUpdateButtonClick() {
  createAxes();
}

// In your init() function or wherever you set up event listeners, add this:
document
  .getElementById("update-button")
  .addEventListener("click", handleUpdateButtonClick);
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  labelRenderer.render(scene, camera);
  renderer.render(scene, camera);
  // console.log(camera.position)
}

// Function to create the line on the perpendicular plane
// Global variable to store the current line length
let anteriorLineLength = 10;

function createAnteriorLine() {
  const femurCenter = landmarkPositions["femurCenter"];
  const projectedTEAStart = landmarkPositions["medialEpicondyle"];
  const projectedTEAEnd = landmarkPositions["lateralEpicondyle"];

  if (!femurCenter || !plane || !projectedTEAStart || !projectedTEAEnd) {
    console.log("Cannot create the line. Required landmarks or plane missing.");
    return;
  }

  // Use the current anteriorLineLength
  const lineEndPoint = new THREE.Vector3()
    .copy(femurCenter)
    .add(new THREE.Vector3(0, -1, 0).multiplyScalar(anteriorLineLength));

  const points = [femurCenter, lineEndPoint];

  if (anteriorLine) {
    // Update the existing line geometry
    anteriorLine.geometry.setFromPoints(points);
    console.log("Updated Anterior Line.");
  } else {
    // Create the line for the first time
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0xff0000, // Red color for better visibility
    });

    anteriorLine = new THREE.Line(geometry, material);
    scene.add(anteriorLine);
    console.log("Created Anterior Line.");
  }

  // Update or create the label for the Anterior Line
  const midpoint = femurCenter.clone().lerp(lineEndPoint, 0.5);
  if (anteriorLabel) {
    anteriorLabel.position.copy(midpoint);
    console.log("Updated Anterior Line label.");
  } else {
    anteriorLabel = createTextLabel("Anterior Line");
    anteriorLabel.position.copy(midpoint);
    scene.add(anteriorLabel);
    console.log("Created Anterior Line label.");
  }

  // Update the label text
  document.getElementById("AnteriorLine/Extension").textContent =
    anteriorLineLength.toFixed(0);
}

// Add event listeners for the buttons
document
  .getElementById("AnteriorLine-positive-button")
  .addEventListener("click", () => {
    anteriorLineLength += 10;
    createAnteriorLine();
  });

document
  .getElementById("AnteriorLine-negative-button")
  .addEventListener("click", () => {
    anteriorLineLength = Math.max(10, anteriorLineLength - 10); // Ensure the length doesn't go below 10
    createAnteriorLine();
  });

// Initial creation of the line
createAnteriorLine();

let flexionExtensionPlane = null; // Flexion/Extension Plane

let currentFlexionRotation = 0; // Track current rotation for Flexion/Extension (starts at 0)
let currentVarusValgusRotation = 0; // Track current rotation for Varus/Valgus (starts at 0)
const minRotation = 0; // Minimum allowed rotation in degrees
const maxRotation = 180; // Maximum allowed rotation in degrees

// Function to create or rotate the Varus/Valgus Plane
function createOrRotateVarusValgusPlane(rotationAngle) {
  if (!plane) {
    console.log(
      "Original perpendicular plane not found. Please create the perpendicular plane first."
    );
    return;
  }

  // Define the mechanical axis from femur center to hip center
  const mechanicalAxis = new THREE.Vector3(0, 1, 0);

  // If the Varus/Valgus plane hasn't been created yet, create it
  if (!varusValgusPlane) {
    // Clone the existing perpendicular plane
    varusValgusPlane = plane.clone();
    scene.add(varusValgusPlane);

    // Make the Varus/Valgus plane more visible
    varusValgusPlane.material.color.set(0xff00ff); // Magenta for visibility
    varusValgusPlane.material.opacity = 0.5;
    console.log("Varus/Valgus plane created and made visible.");
  }

  // Apply the new rotation only if it is within the min-max range
  if (rotationAngle >= minRotation && rotationAngle <= maxRotation) {
    // Reset rotation before applying new rotation to avoid cumulative effects
    varusValgusPlane.rotation.set(0, 0, 0);
    varusValgusPlane.rotateOnAxis(
      mechanicalAxis,
      THREE.MathUtils.degToRad(rotationAngle)
    );
    // console.log(Varus/Valgus plane rotated to ${rotationAngle} degrees.);
    currentVarusValgusRotation = rotationAngle; // Update current rotation

    // Re-render the scene after the plane is rotated
    renderer.render(scene, camera);
  }
}

// Update the Varus/Valgus Plane rotation and render lines again
document.getElementById("positive-button").addEventListener("click", () => {
  const newRotation = currentVarusValgusRotation + 1;
  if (newRotation <= maxRotation) {
    document.getElementById("Varus_valgus").textContent = newRotation;
    createOrRotateVarusValgusPlane(newRotation); // Rotate to new angle
    projectAnteriorLineOnVarusValgusPlane(); // Reproject the anterior line
    createLateralLineOnVarusValgusPlane(); // Recreate the lateral line
  } else {
    console
      .log
      // Maximum rotation of ${maxRotation} degrees reached for Varus/Valgus Plane.
      ();
  }
});

document.getElementById("negative-button").addEventListener("click", () => {
  const newRotation = currentVarusValgusRotation - 1;
  if (newRotation >= minRotation) {
    document.getElementById("Varus_valgus").textContent = newRotation;
    createOrRotateVarusValgusPlane(newRotation); // Rotate to new angle
    projectAnteriorLineOnVarusValgusPlane(); // Reproject the anterior line
    createLateralLineOnVarusValgusPlane(); // Recreate the lateral line
  } else {
    console
      .log
      // Minimum rotation of ${minRotation} degrees reached for Varus/Valgus Plane.
      ();
  }
});

// Function to create or rotate the Flexion/Extension Plane using the Lateral Line as the rotation axis
function createOrRotateFlexionExtensionPlane(rotationAngle) {
  if (!lateralLine) {
    console.log(
      "Lateral Line not found. Cannot rotate the Flexion/Extension Plane."
    );
    return;
  }

  // Get the start and end points of the lateral line
  const lateralLineStart = new THREE.Vector3(
    lateralLine.geometry.attributes.position.array[0],
    lateralLine.geometry.attributes.position.array[1],
    lateralLine.geometry.attributes.position.array[2]
  );

  const lateralLineEnd = new THREE.Vector3(
    lateralLine.geometry.attributes.position.array[3],
    lateralLine.geometry.attributes.position.array[4],
    lateralLine.geometry.attributes.position.array[5]
  );

  // Calculate the direction of the Lateral Line (used as the rotation axis)
  const lateralAxis = new THREE.Vector3()
    .subVectors(lateralLineEnd, lateralLineStart)
    .normalize();

  // If the Flexion/Extension plane hasn't been created yet, create it
  if (!flexionExtensionPlane) {
    const planeGeometry = new THREE.PlaneGeometry(150, 150);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    flexionExtensionPlane = new THREE.Mesh(planeGeometry, planeMaterial);

    // Position the Flexion/Extension Plane at the end of the Lateral Line
    flexionExtensionPlane.position.copy(lateralLineEnd);

    // Add the Flexion/Extension Plane to the scene
    scene.add(flexionExtensionPlane);
    console.log("Flexion/Extension Plane created and made visible.");
  }

  // Apply the new rotation only if it is within the min-max range
  if (rotationAngle >= minRotation && rotationAngle <= maxRotation) {
    flexionExtensionPlane.rotation.set(0, 0, 0); // Reset rotation before applying
    flexionExtensionPlane.rotateOnAxis(
      lateralAxis,
      THREE.MathUtils.degToRad(rotationAngle)
    );
    // console.log(Flexion/Extension Plane rotated to ${rotationAngle} degrees.);
    currentFlexionRotation = rotationAngle; // Update current rotation

    // Re-render the scene after the plane is rotated
    renderer.render(scene, camera);
  }
}

// Attach event listeners to the positive and negative buttons for rotating the Flexion/Extension plane
document
  .getElementById("flexion-positive-button")
  .addEventListener("click", () => {
    const newRotation = currentFlexionRotation + 1;
    if (newRotation <= maxRotation) {
      document.getElementById("Flexion/Extension").textContent = newRotation;
      createOrRotateFlexionExtensionPlane(newRotation); // Rotate to new angle
    } else {
      console
        .log
        // Maximum rotation of ${maxRotation} degrees reached for Flexion/Extension Plane.
        ();
    }
  });

document
  .getElementById("flexion-negative-button")
  .addEventListener("click", () => {
    const newRotation = currentFlexionRotation - 1;
    if (newRotation >= minRotation) {
      document.getElementById("Flexion/Extension").textContent = newRotation;
      createOrRotateFlexionExtensionPlane(newRotation); // Rotate to new angle
    } else {
      console
        .log
        // Minimum rotation of ${minRotation} degrees reached for Flexion/Extension Plane.
        ();
    }
  });

// Helper function to project a point onto a plane
function projectPointOntoPlane(point, plane) {
  const planeNormal = new THREE.Vector3();
  planeNormal.set(
    plane.matrixWorld.elements[8],
    plane.matrixWorld.elements[9],
    plane.matrixWorld.elements[10]
  );

  const pointToPlane = new THREE.Vector3().subVectors(point, plane.position);
  const distance = pointToPlane.dot(planeNormal);

  const projectedPoint = new THREE.Vector3()
    .copy(point)
    .sub(planeNormal.multiplyScalar(distance));

  return projectedPoint;
}

// Function to project the Anterior Line on the Varus/Valgus Plane
function projectAnteriorLineOnVarusValgusPlane() {
  const femurCenter = landmarkPositions["femurCenter"];
  const lineEndPoint = new THREE.Vector3()
    .copy(femurCenter)
    .add(new THREE.Vector3(0, -1, 0).multiplyScalar(10)); // End of the anterior line

  // Ensure Varus/Valgus Plane exists
  if (!varusValgusPlane) {
    console.log("Varus/Valgus Plane is not defined.");
    return;
  }

  // Project the Anterior Line points onto the Varus/Valgus Plane
  const projectedFemurCenter = projectPointOntoPlane(
    femurCenter,
    varusValgusPlane
  );
  const projectedAnteriorEnd = projectPointOntoPlane(
    lineEndPoint,
    varusValgusPlane
  );

  const points = [projectedFemurCenter, projectedAnteriorEnd];

  if (projectedAnteriorLine) {
    // Update the existing projected anterior line
    projectedAnteriorLine.geometry.setFromPoints(points);
    console.log("Updated Projected Anterior Line on Varus/Valgus Plane.");
  } else {
    // Create a new projected anterior line
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    projectedAnteriorLine = new THREE.Line(geometry, material);
    scene.add(projectedAnteriorLine);
    console.log("Created Projected Anterior Line on Varus/Valgus Plane.");
  }

  // Create or update the label for the Projected Anterior Line
  const midpoint = projectedFemurCenter.clone().lerp(projectedAnteriorEnd, 0.5);
  if (projectedAnteriorLabel) {
    projectedAnteriorLabel.position.copy(midpoint);
    console.log("Updated Projected Anterior Line label.");
  } else {
    projectedAnteriorLabel = createTextLabel("Projected Anterior Line");
    projectedAnteriorLabel.position.copy(midpoint);
    scene.add(projectedAnteriorLabel);
    console.log("Created Projected Anterior Line label.");
  }

  // Re-render the scene to ensure the projected line is visible
  renderer.render(scene, camera);
}

// Function to create a Lateral Line perpendicular to the Projected Anterior Line on the Varus/Valgus Plane
function createLateralLineOnVarusValgusPlane() {
  const femurCenter = landmarkPositions["femurCenter"];

  if (!varusValgusPlane || !projectedAnteriorLine) {
    console.log("Varus/Valgus Plane or Projected Anterior Line not defined.");
    return;
  }

  // Calculate the direction of the Projected Anterior Line
  const projectedAnteriorStart =
    projectedAnteriorLine.geometry.attributes.position.array.slice(0, 3);
  const projectedAnteriorEnd =
    projectedAnteriorLine.geometry.attributes.position.array.slice(3, 6);
  const anteriorLineDirection = new THREE.Vector3()
    .subVectors(
      new THREE.Vector3(...projectedAnteriorEnd),
      new THREE.Vector3(...projectedAnteriorStart)
    )
    .normalize();

  // Get the normal of the Varus/Valgus plane
  const planeNormal = new THREE.Vector3();
  planeNormal.set(
    varusValgusPlane.matrixWorld.elements[8],
    varusValgusPlane.matrixWorld.elements[9],
    varusValgusPlane.matrixWorld.elements[10]
  );

  // Calculate the perpendicular direction (Lateral Line direction) by taking the cross product
  const lateralDirection = new THREE.Vector3()
    .crossVectors(anteriorLineDirection, planeNormal)
    .normalize();

  // Create the end point of the Lateral Line (10mm to the lateral side)
  const lateralLineEnd = new THREE.Vector3()
    .copy(femurCenter)
    .add(lateralDirection.multiplyScalar(10));

  const points = [femurCenter, lateralLineEnd];

  if (lateralLine) {
    // Update the existing lateral line geometry
    lateralLine.geometry.setFromPoints(points);
    console.log("Updated Lateral Line on Varus/Valgus Plane.");
  } else {
    // Create a new lateral line
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
    lateralLine = new THREE.Line(geometry, material);
    scene.add(lateralLine);
    console.log("Created Lateral Line on Varus/Valgus Plane.");
  }

  // Create or update the label for the Lateral Line
  const midpoint = femurCenter.clone().lerp(lateralLineEnd, 0.5);
  if (lateralLineLabel) {
    lateralLineLabel.position.copy(midpoint);
    console.log("Updated Lateral Line label.");
  } else {
    lateralLineLabel = createTextLabel("Lateral Line");
    lateralLineLabel.position.copy(midpoint);
    scene.add(lateralLineLabel);
    console.log("Created Lateral Line label.");
  }

  // Re-render the scene to ensure the lateral line is visible
  renderer.render(scene, camera);
}

let distalMedialPlane = null; // Distal Medial Plane reference

// Function to create or update the Distal Medial Plane
function createDistalMedialPlane() {
  const distalMedialPt = landmarkPositions["distalMedialPt"];

  // Check if the Flexion/Extension Plane and Distal Medial Point exist
  if (!flexionExtensionPlane || !distalMedialPt) {
    console.log("Flexion/Extension Plane or Distal Medial Point is missing.");
    return;
  }

  // Clone the Flexion/Extension Plane to create a parallel plane
  if (!distalMedialPlane) {
    const planeGeometry = new THREE.PlaneGeometry(150, 150);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xffff00, // Yellow for distinction
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    distalMedialPlane = new THREE.Mesh(planeGeometry, planeMaterial);

    // Add the new Distal Medial Plane to the scene
    scene.add(distalMedialPlane);
    console.log("Distal Medial Plane created.");
  }

  // Position the new plane at the Distal Medial Pt
  distalMedialPlane.position.copy(distalMedialPt);

  // Copy the orientation (rotation) of the Flexion/Extension Plane to the new plane
  distalMedialPlane.rotation.copy(flexionExtensionPlane.rotation);

  // Re-render the scene to ensure the new plane is visible
  renderer.render(scene, camera);

  console.log(
    "Distal Medial Plane positioned and aligned with Flexion/Extension Plane."
  );
}

let distalResectionPlane = null; // Reference for Distal Resection Plane

// Function to create or update the Distal Resection Plane
function createDistalResectionPlane() {
  const distalMedialPt = landmarkPositions["distalMedialPt"];

  // Ensure the Distal Medial Plane exists and Distal Medial Point is defined
  if (!distalMedialPlane || !distalMedialPt) {
    console.log("Distal Medial Plane or Distal Medial Point is missing.");
    return;
  }

  // Create a new plane if it doesn't exist
  if (!distalResectionPlane) {
    const planeGeometry = new THREE.PlaneGeometry(150, 150);
    const planeMaterial = new THREE.MeshBasicMaterial({
      color: 0xff0000, // Green for distinction
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.5,
    });
    distalResectionPlane = new THREE.Mesh(planeGeometry, planeMaterial);

    // Add the Distal Resection Plane to the scene
    scene.add(distalResectionPlane);
    console.log("Distal Resection Plane created.");
  }

  // Position the new plane 10mm in the proximal direction from the Distal Medial Plane
  const proximalOffset = new THREE.Vector3(0, 0, 10); // 10mm offset in proximal (Y-axis)
  const newPosition = distalMedialPt.clone().add(proximalOffset);

  distalResectionPlane.position.copy(newPosition);

  // Copy the orientation (rotation) of the Distal Medial Plane to the new plane
  distalResectionPlane.rotation.copy(distalMedialPlane.rotation);

  // Re-render the scene to ensure the new plane is visible
  renderer.render(scene, camera);

  console.log(
    "Distal Resection Plane positioned 10mm proximal to the Distal Medial Plane."
  );
}

// Function to calculate and display distances
// Function to calculate and display distances between Distal Medial Pt / Distal Lateral Pt and Distal Resection Plane
function showMeasurements() {
  const distalMedialPt = landmarkPositions["distalMedialPt"];
  const distalLateralPt = landmarkPositions["distalLateralPt"];

  // Ensure the points and the distal resection plane exist
  if (!distalResectionPlane || !distalMedialPt || !distalLateralPt) {
    console.log("Required points or planes are missing.");
    return;
  }

  // Calculate distances
  const distalMedialDistance = calculateDistanceToPlane(
    distalMedialPt,
    distalResectionPlane
  );
  const distalLateralDistance = calculateDistanceToPlane(
    distalLateralPt,
    distalResectionPlane
  );

  // Display measurements in the scene
  displayMeasurement(
    distalMedialPt,
    distalResectionPlane.position,
    distalMedialDistance,
    `Distal Medial = ${distalMedialDistance.toFixed(2)}mm`
  );
  displayMeasurement(
    distalLateralPt,
    distalResectionPlane.position,
    distalLateralDistance,
    `Distal Lateral = ${distalLateralDistance.toFixed(2)}mm`
  );

  console.log(`Distal Medial Distance: ${distalMedialDistance.toFixed(2)}mm`);
  console.log(`Distal Lateral Distance: ${distalLateralDistance.toFixed(2)}mm`);
}

// Function to calculate the distance from a point to a plane
function calculateDistanceToPlane(point, plane) {
  const planeNormal = new THREE.Vector3();
  planeNormal.set(
    plane.matrixWorld.elements[8], // Extract the normal vector from the plane's matrix
    plane.matrixWorld.elements[9],
    plane.matrixWorld.elements[10]
  );

  const pointToPlane = new THREE.Vector3().subVectors(point, plane.position);
  const distance = Math.abs(pointToPlane.dot(planeNormal)); // Dot product to calculate perpendicular distance

  return distance;
}

// Function to display a line and measurement label
function displayMeasurement(start, end, distance, labelText) {
  const points = [start, end];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({ color: 0x00ff00 }); // Green line for distance measurement

  const line = new THREE.Line(geometry, material);
  scene.add(line); // Add the measurement line to the scene

  // Create and add the label with the distance
  const label = createMeasurementLabel(labelText); // Use labelText to include the distance
  const midpoint = start.clone().lerp(end, 0.5); // Find the midpoint for the label
  label.position.copy(midpoint);
  scene.add(label);
}

// Helper function to create a label for the measurement
function createMeasurementLabel(text) {
  const div = document.createElement("div");
  div.className = "label";
  div.textContent = text;
  div.style.backgroundColor = "rgba(0, 0, 0, 0.6)";
  div.style.color = "white";
  div.style.padding = "2px 6px";
  div.style.borderRadius = "3px";
  div.style.fontSize = "10px";
  div.style.pointerEvents = "none";
  div.style.fontFamily = "Arial, sans-serif";
  div.style.fontWeight = "bold";

  const label = new CSS2DObject(div);
  return label;
}

window.addEventListener(
  "resize",
  function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
  },
  false
);

// Initialize the scene
init();
