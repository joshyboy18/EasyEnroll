const classBox = document.createElement('select'); // Create a select box to contain all of the classes added

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

    const option = document.createElement('option'); // Create a new option element for the select box
    option.value = Value;
    option.text = Value;
    classBox.appendChild(option); // Append the new option to the select box

    classChoiceArray.push(Value); // Add the new class to the array to track added classes

    classAnswer.value = ''; // Clear the input box for the next entry

}