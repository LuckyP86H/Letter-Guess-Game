    //-----------------assignment 3 Demo ---------------//

    // creat an algorithm: a plan that solve a problem(guess the letter)

    // creat a list of defined letter that can be guessed 
    var letterChoices = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",];


    // define a var that stores total number of guesses
    var guessSoFar = [];
    var guessLeft= 5;
    var wins = 0;
    var losses = 0;

    // Create variables that hold references to the places in the HTML where we want to display things.
    var instructionsText = document.getElementById("instructions-text");
    var userChooseText = document.getElementById("userchoose-text");

    var winsText = document.getElementById("wins-text");
    var lossesText = document.getElementById("losses-text");

    var guessLeftText = document.getElementById("guessleft-text");
    var guessSoFarText = document.getElementById("guesssofar-text");


    //listen to a key event
    document.onkeyup = function (event) {

      // determine which key is pressed and stored it into userGuess
      var userChoose = event.key;

      // pick a random letter from the list, store that random number in computerGuess
      var computerChoose = letterChoices[Math.floor(Math.random() * letterChoices.length)];

      // store all the letter options in variable options
      var letterOptions = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z",];

      //only letter guess will be consider not special character
      if (letterOptions.indexOf(userChoose) > -1) {

        //if user pressed match random letter
        if (userChoose === computerChoose) {
          wins++;
          guessSoFar = [];
          guessLeft = 5;
        }

        // if not match ramdom letter but still have attempt
        if (userChoose != computerChoose) {
            guessSoFar.push(userChoose);
            guessLeft--;
          }

        //  if run out of attempt
        if (guessLeft === 0) {
          guessLeft = 5;
          losses++;
          guessSoFar = [];
        }

        // Hide the instruction
        instructionsText.textContent = "";

        // Display the user and computer choices
        userChooseText.textContent = "You current choose: " + userChoose;
        guessSoFarText.textContent = "You have guessed: " + guessSoFar;
        guessLeftText.textContent = "You have " + guessLeft + " left!";
        winsText.textContent = "Win: " + wins;
        lossesText.textContent = "Loss: " + losses;

      }

    };