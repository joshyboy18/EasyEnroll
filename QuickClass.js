const classBox = document.createElement('select');

const classChoiceArray = [];
var added = false;

function addClass() {

    const classChoice = document.getElementById('text_box');
    const classAnswer = document.getElementById('text_input');
    const Value = classAnswer.value.trim();

    if (!Value || classChoiceArray.includes(Value)) {

        alert("Please select a class to add.");
        return;
    }


    if (!added) {

        classChoice.after(classBox);
        added = true;

    }

    const option = document.createElement('option');
    option.value = Value;
    option.text = Value;
    classBox.appendChild(option);

    classChoiceArray.push(Value);

    classAnswer.value = '';

}