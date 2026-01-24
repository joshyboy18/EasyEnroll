import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'

function App() {
  
  return (

    <div className = "text_box" id="text_box">
      <input type="text" id="text_input" placeholder="Enter Class Name Here"></input>
      <button onClick={addClass}> Add Class </button>
      <button onClick={removeClass}> Remove Class </button>
    </div>

  
  )
}

const classBox = document.createElement('text'); // Create a select box to contain all of the classes added

const classChoiceArray = []; // Array to keep track of added classes to prevent duplicates
var added = false;

function addClass() {

    const classChoice = document.getElementById('text_box'); // Get the div where the select box will be added
    const classAnswer = document.getElementById('text_input'); // Get the input box where the user types the class name
    const Value = classAnswer.value.trim(); // Trim to handle any extra spaces

     // Check if the class is already added or if the input is empty

    if (!Value || classChoiceArray.includes(Value)) {

        alert("Please select a class to add."); // If there is a duplicate or empty input, alert the user
        return; // Exit the function early
    }


    if (!added) { // If this is the first class being added, append the select box to the div, else skip this step

        classChoice.after(classBox);
        added = true; // Update the flag to indicate that the select box has been added

    }

    const classItem = document.createElement('div'); // Create a div to display the class name
    classItem.textContent = Value;
    classBox.appendChild(classItem); // Append the new class item to the div
    
    classChoiceArray.push(Value); // Add the new class to the array to track added classes
    console.log(Value); 
    classAnswer.value = ''; // Clear the input box for the next entry

}

function removeClass() {

    var index = classChoiceArray.length - 1; // Get the index of the last added class
    if (index === -1) {

        alert("Cannot remove classes at this time."); // Placeholder alert for future functionality

      
    }

    else {

      classBox.removeChild(classBox.childNodes[index]); // Remove the last added class from the text box using childNodes
      classChoiceArray.splice(index, 1); // Remove the class from the tracking array
        
    }
}


export default App
