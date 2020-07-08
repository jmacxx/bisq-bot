var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
var crParser = require('./crParser')

/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Application} app
 */
module.exports = app => {
    app.log('app loaded!')
    var html = httpGet('https://api.github.com/repos/bisq-network/compensation/issues?creator=mwithm');
    app.log(crParser.configLoadBsqRate(html));

    // bot workflow:
    // if [WIP] in title then don't do anything
    // if safeMode then don't do anything
    // issue created or edited => run the parser, write error rpt if applicable, apply labels
    // issue labeled or milestoned => update labelling, write issuance rpt if applicable
    // issue comment created or edited => nothing
    //
    var safeMode = false;
 
    app.on(['issues.opened','issues.edited'], async context => {
        logContextInfo(context);
        if (context.isBot) {
            app.log("isBot=true, ignoring");
            return;
        }

        crParser.parseContributionRequest(context.payload.issue.body);
        // log our parsing result
        app.log(crParser.writeLinterSummary());
        app.log(crParser.writeIssuance());

        var isWIP = /\[WIP\]/gi.test(context.payload.issue.title);
        if (isWIP) {
            app.log("issue is marked [WIP], therefore not making any changes");
            return;
        }

        if (crParser.compRequest.errorList.length > 0) {
            applyLabels(context, ["parsed:invalid"], /^parsed:/g);
            app.log("I think we should write the error report");
            var errRpt = crParser.writeLinterSummary();
            const newComment = context.issue({ body: errRpt });
            // ONLY WRITE THE ERROR REPORT WHEN REALLY SURE
            if (!safeMode) {
                context.github.issues.createComment(newComment);
            }
        }
        else {
            applyLabels(context, ["parsed:valid"], /^parsed:/g);
        }
        // manage the team labels
        applyLabels(context, crParser.getTeamLabels(), /^team:/g);
    })

    app.on(['issues.labeled', 'issues.milestoned'], async context => {
        logContextInfo(context);
        if (context.isBot) {
            app.log("isBot=true, ignoring");
            return;
        }

        var isWIP = /\[WIP\]/gi.test(context.payload.issue.title);
        if (isWIP) {
            app.log("issue is marked [WIP], therefore not making any changes");
            return;
        }
        crParser.parseContributionRequest(context.payload.issue.body);

        // issuance should be written after the comp request has been accepted
        if (isIssueAccepted(context)) {
            app.log("issueWasAccepted! I think we should write the issuance report");
            var issuance = crParser.writeIssuance();
            const newComment = context.issue({ body: issuance });
            if (!safeMode) {
                context.github.issues.createComment(newComment);
            }
            return;
        }
    })

    function logContextInfo(context) {
        app.log("event: " + context.event + " action: " + context.payload.action);
        app.log("title: " + context.payload.issue.title);
        app.log("safeMode: " + safeMode);
        app.log("================ ISSUE # " + context.payload.issue.number + " =====================");
    }

    function isIssueAccepted(context) {
        let existingLabels = [];
        var labelObjs = context.payload.issue.labels;
        labelObjs.map(label => existingLabels.push(label.name));
        return (existingLabels.indexOf("was:accepted") >= 0);
    }

    function applyLabels(context, labelsRequired, regexFilter) {
        let existingLabels = [];
        var labelObjs = context.payload.issue.labels;
        labelObjs.map(label => existingLabels.push(label.name));
        existingLabels = existingLabels.filter(label => label.match(regexFilter));

        app.log("existing labels: " + existingLabels);
        app.log("labels required: " + labelsRequired);
        var labelsToAdd = labelsRequired.filter(label => existingLabels.indexOf(label) < 0);
        var labelsToRemove = existingLabels.filter(label => labelsRequired.indexOf(label) < 0);
        for (const lbl of labelsToRemove) { 
            app.log("removing: "+lbl);
            if (!safeMode) {
                context.github.issues.removeLabel(context.issue({name: lbl}));
            }
        }
        for (const lbl of labelsToAdd) {
            app.log("adding: "+lbl); 
            if (!safeMode) {
                context.github.issues.addLabels(context.issue({labels: lbl.split()}));
            }
        }
    }

    function httpGet(theUrl) {
        var xmlHttp = new XMLHttpRequest();
        xmlHttp.open( "GET", theUrl, false ); // false for synchronous request
        xmlHttp.send( null );
        return xmlHttp.responseText;
    }




    // For more information on building apps:
    // https://probot.github.io/docs/

    // To get your app running against GitHub, see:
    // https://probot.github.io/docs/development/
}
